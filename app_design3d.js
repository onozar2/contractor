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
     • Variations 1/3 — bridge prompt appends "Generate N variations…"; the
       server renders N in parallel into a variation grid.
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

  // ── Property-archetype (🏠 Home) taxonomy. The live list comes from
  // /api/knowledge/archetypes (the property-archetypes.json LA housing-stock
  // library shared with the Q&A knowledge base + the render brief). Picking an
  // archetype posts "Home: <tier> · <name>" through the chat so the brief's
  // PROPERTY CARD picks it up, exactly like styles post "Style: <name>".
  var ARCHETYPES = [];   // [{id,name,stories,eras,tiersPresent,neighborhoods,summary}]
  var HOME_TIERS = [];   // [{key,label,desc}] from the /archetypes payload
  // Archetype cards group by the stories field into three friendly buckets.
  var HOME_GROUPS = [
    { key: "one",  label: "One story" },
    { key: "two",  label: "Two story" },
    { key: "flex", label: "Flexible (1-2)" }
  ];
  function storiesGroupKey(s) {
    if (s === 1 || s === "1") return "one";
    if (/^\s*1\s*[-–]\s*\d/.test(String(s))) return "flex"; // "1-2", "1-3"
    return "two";                                                // 2, 3, "2-3", etc.
  }
  function homeTierLabel(key) {
    for (var i = 0; i < HOME_TIERS.length; i++) {
      if (HOME_TIERS[i].key === key) return HOME_TIERS[i].label;
    }
    return "";
  }

  // ── View state (one flow at a time; reset on every render()) ──
  var st = null;
  // Active tab survives view re-renders (Studio work is lost on a full render,
  // so tab switches only show/hide panes — they never re-render the view).
  var activeTab = "studio";
  var AI_DISCLAIMER_FALLBACK = "AI concept visualization — this image was generated by AI to communicate design intent. The finished project may differ in materials, colors, dimensions, and details. The work performed is defined solely by the written Scope of Work.";
  var aiDisclaimer = AI_DISCLAIMER_FALLBACK;
  function freshState() {
    return {
      photoFile: null,        // File the customer photographed / chose
      photoUrl: null,         // object URL for the hero preview
      messages: [],           // [{role:'user'|'assistant', text}]
      renderPrompt: "",       // latest composed instruction (chat source of truth)
      chatBusy: false,
      mode: "redecorate",     // "redecorate" | "remodel" — preservation clause
      styleSel: "",           // currently selected style chip name
      homeSel: { tier: "", archetype: "" }, // 🏠 Home picker: LA housing type + tier
      quality: "fast",        // "fast" (flash, ~8s) | "max" (pro model, ~15s)
      variations: 3,          // 1 | 3 — default 3 (renders 3 options in parallel)
      genAfterUrl: null,      // selected /uploads path when an API render succeeds
      variationUrls: [],      // all rendered variations (in-app path)
      matCache: {},           // imageUrl -> materials response (per-option, session)
      matSeq: 0,              // bumped per estimate request; stale responses dropped
      attachFile: null,       // the Gemini render the user attaches back
      attachUrl: null,
      projectId: "design-studio",
      projectName: "Design Studio",
      projects: [],           // [{projectId, projectName}] for the picker
      _onPaste: null,
      _onSheetKey: null,      // Esc handler while the style picker sheet is open
      _onHomeKey: null        // Esc handler while the 🏠 Home picker sheet is open
    };
  }

  function slugify(v) {
    return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  function money(n) {
    var v = Math.round(Number(n) || 0);
    return "$" + v.toLocaleString("en-US");
  }

  // Client-side fallback prompt (mode-aware) if the /design-brief endpoint is down.
  function preserveClause(mode) {
    if (mode === "remodel") return "REMODEL edit: keep the exact camera angle, room envelope and the window and door positions and perspective lines; you MAY reconfigure cabinetry, layout, built-ins and fixtures to suit the new design";
    if (mode === "staging") return "VIRTUAL STAGING edit: keep the exact camera angle, room envelope, walls, windows, doors, flooring and every built-in finish exactly as photographed; ADD furniture, rugs, art, plants, lamps and decor only — change no existing surface or fixture";
    return "STRUCTURE-PRESERVING edit: keep the exact camera angle and room envelope — the walls, windows, doors, ceiling and built-in cabinetry stay in their current positions and perspective lines; change only finishes, colors, furniture, decor, textiles and lighting fixtures";
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
    "#dzSheet,#dzHomeSheet{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:1.1rem;background:rgba(16,24,40,0.38);backdrop-filter:blur(2px)}" +
    "#dzSheet .sheet,#dzHomeSheet .sheet{width:100%;max-width:640px;max-height:calc(100% - 2rem);overflow-y:auto;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 60px rgba(16,24,40,0.28);padding:1rem 1.1rem 1.2rem}" +
    "#dzStyleBar{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center}" +
    "#dzHomeTiers{margin-bottom:0.3rem}" +
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
    "#dzReplace{position:absolute;top:0.6rem;right:0.6rem;z-index:2;display:flex;gap:0.4rem}" +
    "#dzReplace .btn{padding:0 0.5rem;font-size:1rem;line-height:1}" +
    // Hero photo-source buttons (📷 Take photo / 🖼️ Camera roll) under the copy
    ".dz-photo-btns{display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin-top:0.7rem}" +
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
    // Render prompt panel (collapsible — collapsed by default, persisted)
    "#dzPromptCard{margin-top:1.1rem}" +
    ".dz-prompt-toggle{display:flex;align-items:center;gap:0.5rem;width:100%;cursor:pointer;user-select:none;-webkit-user-select:none}" +
    ".dz-prompt-toggle .pt-chev{flex:0 0 auto;color:var(--muted);font-size:0.7rem;width:0.8rem;text-align:center}" +
    ".dz-prompt-toggle .pt-k{flex:0 0 auto;font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);white-space:nowrap}" +
    ".dz-prompt-toggle .pt-note{flex:0 0 auto;font-size:0.7rem;font-weight:600;color:var(--muted)}" +
    ".dz-prompt-toggle .pt-prev{flex:1;min-width:0;font-size:0.78rem;color:#8a93a3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".dz-prompt-toggle .pt-copy{flex:0 0 auto;margin-left:auto;padding:0.15rem 0.5rem;font-size:0.72rem}" +
    "#dzPrompt{width:100%;margin-top:0.5rem;min-height:84px;resize:vertical;border:1px solid #e2e7ee;border-radius:10px;padding:0.6rem 0.75rem;font:inherit;font-size:0.86rem;line-height:1.5;color:#3c4658;background:#f8fafc}" +
    // Action bar (sticky)
    "#dzBar{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:0.55rem;align-items:center;margin-top:0.9rem;padding:0.7rem;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,0.92);backdrop-filter:blur(6px);box-shadow:0 -6px 20px rgba(16,24,40,0.06)}" +
    "#dzBar .grow{flex:1;min-width:0}" +
    "#dzBar .note{font-size:0.74rem;color:var(--muted)}" +
    // Result + attach
    "#dzResult{margin-top:1.1rem}" +
    ".dz-calm{background:#f4f8ff;border:1px solid #cfe0fb;border-radius:10px;padding:0.7rem 0.85rem;color:#2b4a7a;font-size:0.86rem;line-height:1.5}" +
    ".dz-coach{margin-top:0.5rem;font-size:0.74rem;color:var(--muted);line-height:1.45}" +
    // Option cards (3-up grid under the hero slider; 1 col ≤700px)
    ".dz-opts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0.6rem;margin-top:0.7rem}" +
    ".dz-opt{display:flex;flex-direction:column;border:2px solid transparent;border-radius:10px;overflow:hidden;cursor:pointer;background:#f0f2f5;padding:0;text-align:left}" +
    ".dz-opt .opt-img{display:block;width:100%;aspect-ratio:4/3;background:#e6eaf0}" +
    ".dz-opt .opt-img img{width:100%;height:100%;object-fit:cover;display:block}" +
    ".dz-opt .opt-lab{display:block;font-size:0.72rem;font-weight:800;color:#586074;padding:0.32rem 0.5rem;background:#eef1f6;text-align:center}" +
    ".dz-opt.sel{border-color:var(--blue)}" +
    ".dz-opt.sel .opt-lab{background:var(--blue);color:#fff}" +
    "@media (max-width:700px){.dz-opts{grid-template-columns:1fr}}" +
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
    // Materials & rough costs (BETA)
    "#dzMaterials{margin-top:1.1rem}" +
    ".dz-mat-head{display:flex;align-items:center;gap:0.55rem;flex-wrap:wrap;margin-bottom:0.6rem}" +
    ".dz-mat-btn{margin-left:auto;font-size:0.8rem}" +
    ".dz-mat-btn:disabled{opacity:0.5;cursor:default}" +
    ".dz-mat-rows{display:flex;flex-direction:column;gap:0.1rem;margin-top:0.2rem}" +
    ".dz-mat-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:0.25rem 0.8rem;padding:0.55rem 0;border-bottom:1px solid var(--line)}" +
    ".dz-mat-row:last-child{border-bottom:0}" +
    ".dz-mat-name{flex:1 1 58%;min-width:11rem}" +
    ".dz-mat-name b{font-weight:800;font-size:0.9rem;color:#1d2634}" +
    ".dz-mat-spec{display:block;font-size:0.72rem;color:var(--muted);margin-top:0.12rem;line-height:1.35}" +
    ".dz-mat-unit{flex:0 0 auto;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted)}" +
    ".dz-mat-cost{flex:0 0 auto;font-size:0.88rem;font-weight:800;color:#1d2634;white-space:nowrap}" +
    ".dz-mat-tag{flex:0 0 auto;margin-left:auto}" +
    ".dz-mat-note{margin-top:0.7rem;font-size:0.72rem;color:var(--muted);line-height:1.5}" +
    "@media (max-width:700px){.dz-mat-row{gap:0.2rem 0.6rem}.dz-mat-name{flex:1 1 100%;min-width:0}.dz-mat-tag{margin-left:0}}" +
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
    // ── Tabs (Studio | Designer review | Showcase) ──
    "#dzTabs{display:flex;gap:0.35rem;margin:0.1rem 0 1rem;border-bottom:2px solid var(--line)}" +
    "#dzTabs button{border:0;background:transparent;font:inherit;font-weight:800;font-size:0.88rem;color:var(--muted);padding:0.5rem 0.85rem;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;display:inline-flex;align-items:center;gap:0.4rem}" +
    "#dzTabs button.on{color:var(--blue);border-bottom-color:var(--blue)}" +
    "#dzTabs .tbadge{background:#fdf3e7;color:#b45309;border:1px solid #f3ddc0;border-radius:999px;font-size:0.68rem;font-weight:850;padding:0 0.45rem;min-width:1.2rem;text-align:center}" +
    // Status pills (submission history + review cards)
    ".dz-status{display:inline-block;border-radius:999px;padding:0.1rem 0.55rem;font-size:0.66rem;font-weight:850;text-transform:uppercase;letter-spacing:0.05em;border:1px solid transparent}" +
    ".dz-status.pending{background:#fdf3e7;color:#b45309;border-color:#f3ddc0}" +
    ".dz-status.approved{background:#e7f6f4;color:#0f766e;border-color:#bfe6e1}" +
    ".dz-status.changes{background:#eef4fe;color:#1d4ed8;border-color:#cfe0fb}" +
    ".dz-status.rejected{background:#fdecea;color:#b42318;border-color:#f5c9c4}" +
    // Review queue cards
    ".dz-rv{border:1px solid var(--line);border-radius:14px;background:#fff;padding:0.9rem;margin-bottom:1rem}" +
    ".dz-rv-head{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin-bottom:0.6rem}" +
    ".dz-rv-head b{font-size:0.95rem;color:#1d2634}" +
    ".dz-rv-head .meta{font-size:0.74rem;color:var(--muted)}" +
    ".dz-rv-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:0.9rem;align-items:start}" +
    "@media (max-width:820px){.dz-rv-grid{grid-template-columns:1fr}}" +
    ".dz-rv-prompt{font-size:0.78rem;color:var(--muted);background:#f8fafc;border:1px solid #e2e7ee;border-radius:8px;padding:0.5rem 0.65rem;margin-top:0.55rem;line-height:1.45;max-height:5.6em;overflow:auto}" +
    ".dz-rv-form .k{display:block;font-size:0.66rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin:0.65rem 0 0.25rem}" +
    ".dz-rv-form input[type=number],.dz-rv-form input[type=text],.dz-rv-form textarea{width:100%;border:1px solid #d8dee8;border-radius:8px;padding:0.45rem 0.6rem;font:inherit;font-size:0.86rem;background:#f8fafc}" +
    ".dz-rv-form textarea{min-height:60px;resize:vertical}" +
    ".dz-rv-price{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem}" +
    ".dz-rv-actions{display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.8rem;align-items:center}" +
    ".dz-rv-actions .msg{font-size:0.76rem;color:var(--muted)}" +
    ".dz-chk{display:inline-flex;align-items:center;gap:0.4rem;font-size:0.8rem;color:#3c4658;cursor:pointer}" +
    // Showcase gallery
    ".dz-banner{display:flex;gap:0.6rem;align-items:flex-start;background:#fdf7f3;border:1.5px solid #e5b9a1;border-radius:12px;padding:0.75rem 0.95rem;font-size:0.8rem;color:#7a3a1d;line-height:1.5;margin-bottom:1rem}" +
    ".dz-banner .ico{font-size:1.1rem;line-height:1.2}" +
    ".dz-sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:0.9rem}" +
    ".dz-sc{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff;cursor:pointer;transition:box-shadow 0.15s;text-align:left;padding:0;font:inherit;display:flex;flex-direction:column}" +
    ".dz-sc:hover{box-shadow:0 10px 28px rgba(16,24,40,0.12)}" +
    ".dz-sc .im{position:relative}" +
    ".dz-sc .im img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#f0f2f5}" +
    ".dz-sc .im .ai{position:absolute;top:0.5rem;left:0.5rem;background:rgba(17,24,39,0.85);color:#fff;font-size:0.6rem;font-weight:800;padding:0.14rem 0.5rem;border-radius:999px}" +
    ".dz-sc .im .st{position:absolute;bottom:0.5rem;left:0.5rem;background:rgba(255,255,255,0.92);color:#1d2634;font-size:0.64rem;font-weight:800;padding:0.14rem 0.5rem;border-radius:999px}" +
    ".dz-sc .bd{padding:0.6rem 0.75rem 0.7rem;display:flex;flex-direction:column;gap:0.3rem}" +
    ".dz-sc .bd b{font-size:0.88rem;color:#1d2634}" +
    ".dz-sc .bd .sub2{font-size:0.72rem;color:var(--muted)}" +
    ".dz-sc .bd .price{font-size:0.76rem;font-weight:800;color:#0f766e}" +
    "@media (max-width: 820px){#dzTop{grid-template-columns:1fr}#dzChat{order:2}#dzPhoto{order:1;min-height:0}#dzThread{max-height:44vh}}";

  /* ============================ RENDER ============================ */

  function render(container) {
    st = freshState();
    closeStyleSheet(); // drop any picker sheet left over from a prior view
    closeHomeSheet();
    if (!document.getElementById("dzCss")) {
      var style = document.createElement("style");
      style.id = "dzCss"; style.textContent = CSS;
      document.head.appendChild(style);
    }

    container.innerHTML =
      '<div id="dz">' +
        '<div class="viewhead"><h1>🎨 Design <span class="muted" style="font-weight:700;font-size:0.85rem">— photograph the room, describe the look, get a photoreal redesign</span></h1></div>' +
        '<div id="dzTabs">' +
          '<button type="button" data-tab="studio">✨ Studio</button>' +
          '<button type="button" data-tab="review">✅ Designer review <span class="tbadge" id="dzRvBadge" style="display:none">0</span></button>' +
          '<button type="button" data-tab="showcase">🏆 Showcase</button>' +
        '</div>' +
        '<div id="dzPaneStudio">' +
        '<div id="dzStyleBar">' + stylePillHtml() + homePillHtml() + '</div>' +
        '<div class="dz-ctrls">' +
          '<div class="dz-ctrl"><span class="k">Mode</span>' +
            '<div class="dz-seg" id="dzMode">' +
              '<button type="button" data-mode="redecorate" class="on">Redecorate</button>' +
              '<button type="button" data-mode="remodel">Remodel</button>' +
              '<button type="button" data-mode="staging">Staging</button>' +
            '</div>' +
            '<span class="hint" id="dzModeHint">keep layout, walls &amp; cabinets — restyle only</span>' +
          '</div>' +
          '<div class="dz-ctrl"><span class="k">Variations</span>' +
            '<div class="dz-seg" id="dzVary">' +
              '<button type="button" data-n="1">1</button>' +
              '<button type="button" data-n="3" class="on">3</button>' +
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
            '<div id="dzReplace" style="display:none">' +
              '<button class="btn" id="dzReplaceRoll" type="button" title="Choose a different photo from your camera roll">🖼️</button>' +
              '<button class="btn" id="dzReplaceCam" type="button" title="Take a new photo">📷</button>' +
            '</div>' +
            '<div id="dzDrop" role="button" tabindex="0">' +
              '<span class="big">📷</span>' +
              '<span class="t1">Take or choose a photo of the room</span>' +
              '<span class="t2">Take a new photo or pick an existing one from your camera roll — or drop / paste a photo here. This exact room gets redesigned — nothing moves.</span>' +
              '<div class="dz-photo-btns">' +
                '<button class="btn" id="dzPickCam" type="button">📷 Take photo</button>' +
                '<button class="btn" id="dzPickRoll" type="button">🖼️ Camera roll</button>' +
              '</div>' +
            '</div>' +
            '<input type="file" id="dzFileCam" accept="image/*" capture="environment" style="display:none" />' +
            '<input type="file" id="dzFileRoll" accept="image/*" style="display:none" />' +
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
          '<div class="dz-prompt-toggle" id="dzPromptToggle" role="button" tabindex="0" aria-expanded="false" aria-controls="dzPrompt">' +
            '<span class="pt-chev" id="dzPromptChev">▸</span>' +
            '<span class="pt-k">Render instruction</span>' +
            '<span class="pt-note" id="dzPromptNote" style="display:none">(editable — updates as you chat)</span>' +
            '<span class="pt-prev" id="dzPromptPreview"></span>' +
            '<button class="btn pt-copy" id="dzCopyPrompt" type="button" style="display:none">Copy</button>' +
          '</div>' +
          '<textarea id="dzPrompt" style="display:none" placeholder="Your render instruction composes here once you add a photo and tell me what you want. You can also type it by hand."></textarea>' +
        '</div>' +
        '<div id="dzBar">' +
          '<button class="btn primary" id="dzGen" type="button">✨ Generate here</button>' +
          '<button class="btn" id="dzGemini" type="button" title="Copies the render instruction and opens Gemini — free with your Google AI Pro plan; attach the same photo there">🖼️ Open in Gemini (free)</button>' +
          '<span class="grow"></span>' +
          '<span class="note">Structure-preserving — same photoreal engine as the build-stage renders.</span>' +
        '</div>' +
        '<div id="dzResult"></div>' +
        '<div class="card" id="dzMaterials">' +
          '<div class="dz-mat-head">' +
            '<h2 style="margin:0;font-size:1.05rem">🧱 Materials &amp; rough costs</h2>' +
            '<span class="pill amber">BETA</span>' +
            '<span class="dz-seg" id="dzMatOpts" style="display:none"></span>' +
            '<button class="btn dz-mat-btn" id="dzMatBtn" type="button">Estimate materials</button>' +
            '<span class="grow"></span>' +
            '<span class="note" id="dzMatBasis" style="font-size:0.74rem"></span>' +
          '</div>' +
          '<div id="dzMatBody" class="dz-mat-body"><div class="muted" style="font-size:0.82rem">Generate a design first — then I\'ll read the brief and rough out the materials (beta).</div></div>' +
        '</div>' +
        '<div id="dzHistory"></div>' +
        '</div>' +
        '<div id="dzPaneReview" style="display:none"></div>' +
        '<div id="dzPaneShowcase" style="display:none"></div>' +
      '</div>';

    wireTabs();
    wireStyles();
    wireHome();
    wireControls();
    wirePhoto();
    wireChat();
    wirePrompt();
    wireActions();
    wireMaterials();
    seedChat();
    loadProjects();
    loadStyleLibrary();
    loadHomeLibrary();
    loadDisclaimer();
    refreshReviewBadge();
    setTab(activeTab);
  }

  /* ============================ TABS ============================ */

  function wireTabs() {
    document.getElementById("dzTabs").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-tab]");
      if (b) setTab(b.getAttribute("data-tab"));
    });
  }

  // Show/hide panes (never re-render Studio — its in-progress photo/chat state
  // lives in the DOM). Review + Showcase reload their data on every activation.
  function setTab(tab) {
    activeTab = tab === "review" || tab === "showcase" ? tab : "studio";
    var tabs = document.getElementById("dzTabs");
    if (!tabs) return;
    Array.prototype.forEach.call(tabs.querySelectorAll("button[data-tab]"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-tab") === activeTab);
    });
    var panes = { studio: "dzPaneStudio", review: "dzPaneReview", showcase: "dzPaneShowcase" };
    Object.keys(panes).forEach(function (key) {
      var el = document.getElementById(panes[key]);
      if (el) el.style.display = key === activeTab ? "" : "none";
    });
    if (activeTab === "review") loadReviewPane();
    if (activeTab === "showcase") loadShowcasePane();
  }

  function loadDisclaimer() {
    APP.fetchJSON("/api/design/disclaimer").then(function (r) {
      if (r && r.disclaimer) aiDisclaimer = r.disclaimer;
    }).catch(function () { /* fallback text already set */ });
  }

  function refreshReviewBadge() {
    APP.fetchJSON("/api/design/renders/summary").then(function (s) {
      var badge = document.getElementById("dzRvBadge");
      if (!badge) return;
      var n = (s && s.pending) || 0;
      badge.textContent = String(n);
      badge.style.display = n ? "" : "none";
    }).catch(function () {});
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
    if (bar) bar.innerHTML = stylePillHtml() + homePillHtml();
  }

  function wireStyles() {
    var bar = document.getElementById("dzStyleBar");
    bar.addEventListener("click", function (e) {
      // The Home pill lives in the same bar and also uses .pl-x for its clear;
      // scope both branches to #dzStyleOpen so a Home click is left to wireHome.
      if (!e.target.closest("#dzStyleOpen")) return;
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

  /* ============================ HOME (PROPERTY) PICKER ============================ */

  // The 🏠 Home pill, beside the 🎨 Style pill in the same bar. Unset shows
  // "🏠 Home: not set · Choose ▾"; when set it shows "🏠 <tier label> · <name>"
  // with a ✕ that clears it. The whole pill opens the property sheet.
  function homePillHtml() {
    if (st.homeSel && st.homeSel.archetype) {
      var tl = st.homeSel.tier ? homeTierLabel(st.homeSel.tier) : "";
      var v = (tl ? tl + " · " : "") + st.homeSel.archetype;
      return '<button type="button" class="dz-pill set" id="dzHomeOpen" title="Change or clear home type">' +
          '<span class="pl-ico">🏠</span>' +
          '<span class="pl-k">Home</span>' +
          '<span class="pl-v">' + APP.esc(v) + '</span>' +
          '<span class="pl-x" id="dzHomeClear" role="button" aria-label="Clear home type" title="Clear home type">✕</span>' +
        '</button>';
    }
    return '<button type="button" class="dz-pill" id="dzHomeOpen" title="Choose the home type">' +
        '<span class="pl-ico">🏠</span>' +
        '<span class="pl-k">Home</span>' +
        '<span class="pl-v">not set</span>' +
        '<span class="pl-cta">Choose ▾</span>' +
      '</button>';
  }

  function wireHome() {
    var bar = document.getElementById("dzStyleBar");
    bar.addEventListener("click", function (e) {
      if (!e.target.closest("#dzHomeOpen")) return;   // only the Home pill
      if (e.target.closest(".pl-x")) {                // clear selection
        var prevTier = st.homeSel.tier ? homeTierLabel(st.homeSel.tier) : "";
        var cleared = (prevTier ? prevTier + " · " : "") + st.homeSel.archetype;
        st.homeSel = { tier: "", archetype: "" };
        renderStyleBar();
        // Mirror the style-clear inverse: selection posted a "Home: ..." user
        // turn; drop it and silently recompose the brief without it.
        st.messages = st.messages.filter(function (m) {
          return !(m.role === "user" && m.text === "Home: " + cleared);
        });
        refreshBrief("Cleared " + cleared + " — updated the render instruction below.");
        return;
      }
      openHomeSheet();
    });
  }

  function homeCardHtml(a) {
    var bits = [];
    if (a.eras) bits.push(a.eras);
    if (Array.isArray(a.neighborhoods) && a.neighborhoods.length) bits.push(a.neighborhoods.slice(0, 2).join(", "));
    var sel = (st.homeSel && st.homeSel.archetype === a.name) ? " sel" : "";
    return '<button type="button" class="sheet-card' + sel + '" data-arch="' + APP.esc(a.name) + '">' +
      '<span class="tx"><span class="nm">' + APP.esc(a.name) + '</span>' +
        '<span class="ds">' + APP.esc(bits.join(" · ")) + '</span></span>' +
    '</button>';
  }

  // Opens the property sheet: an optional tier segmented row on top, then the
  // archetype cards grouped One story / Two story / Flexible (1-2) by stories.
  // Picking an archetype (with whatever tier is selected) posts "Home: <tier> ·
  // <name>" through the chat so the brief's PROPERTY CARD picks it up.
  function openHomeSheet() {
    closeHomeSheet();
    // Tier row (single-select, optional — clicking the active tier de-selects it).
    var tierBtns = HOME_TIERS.map(function (t) {
      return '<button type="button" data-tier="' + APP.esc(t.key) + '"' +
        (st.homeSel.tier === t.key ? ' class="on"' : "") + '>' + APP.esc(t.label) + '</button>';
    }).join("");
    var tierRow = HOME_TIERS.length
      ? '<div class="sheet-grp">Home tier <span class="muted" style="font-weight:600">— optional</span></div>' +
        '<div class="dz-seg" id="dzHomeTiers">' + tierBtns + '</div>'
      : "";
    // Archetype groups by stories.
    var buckets = {};
    ARCHETYPES.forEach(function (a) {
      var g = storiesGroupKey(a.stories);
      (buckets[g] = buckets[g] || []).push(a);
    });
    var body = "";
    HOME_GROUPS.forEach(function (grp) {
      var items = buckets[grp.key];
      if (!items || !items.length) return;
      body += '<div class="sheet-grp">' + APP.esc(grp.label) + '</div>' +
        '<div class="sheet-grid">' + items.map(homeCardHtml).join("") + '</div>';
    });
    if (!ARCHETYPES.length) {
      body = '<div class="muted" style="font-size:0.85rem;padding:0.4rem 0">The home-type library isn\'t available right now — pick a style and describe the home in chat instead.</div>';
    }
    var sheet = document.createElement("div");
    sheet.id = "dzHomeSheet";
    sheet.innerHTML =
      '<div class="sheet" role="dialog" aria-label="Choose the home type" aria-modal="true">' +
        '<div class="sheet-head"><h3>🏠 What kind of home is it?</h3>' +
          '<button type="button" class="x" id="dzHomeSheetX" aria-label="Close">✕</button></div>' +
        tierRow + body +
      '</div>';
    document.body.appendChild(sheet);

    sheet.addEventListener("click", function (e) {
      if (e.target === sheet || e.target.closest("#dzHomeSheetX")) { closeHomeSheet(); return; }
      var tb = e.target.closest("#dzHomeTiers button[data-tier]");
      if (tb) {
        var key = tb.getAttribute("data-tier");
        st.homeSel.tier = (st.homeSel.tier === key) ? "" : key;  // toggle
        Array.prototype.forEach.call(sheet.querySelectorAll("#dzHomeTiers button"), function (x) {
          x.classList.toggle("on", x === tb && st.homeSel.tier === key);
        });
        return;   // stay open — tier alone doesn't post; the archetype pick does
      }
      var card = e.target.closest(".sheet-card[data-arch]");
      if (!card) return;
      st.homeSel.archetype = card.getAttribute("data-arch");
      renderStyleBar();
      closeHomeSheet();
      // A re-pick must REPLACE the old choice, not stack a second "Home:" turn
      // (stale-archetype grounding bug from review loop 1): drop any prior
      // "Home: ..." user turn before posting the new one.
      st.messages = st.messages.filter(function (m) {
        return !(m.role === "user" && m.text.indexOf("Home: ") === 0);
      });
      var tl = st.homeSel.tier ? homeTierLabel(st.homeSel.tier) : "";
      sendChat("Home: " + (tl ? tl + " · " : "") + st.homeSel.archetype);
    });
    st._onHomeKey = function (ev) { if (ev.key === "Escape") closeHomeSheet(); };
    document.addEventListener("keydown", st._onHomeKey);
  }

  function closeHomeSheet() {
    var s = document.getElementById("dzHomeSheet");
    if (s && s.parentNode) s.parentNode.removeChild(s);
    if (st && st._onHomeKey) { document.removeEventListener("keydown", st._onHomeKey); st._onHomeKey = null; }
  }

  // Live archetype library from /api/knowledge/archetypes; the sheet is built
  // from it on open, so there's no live DOM to rebuild here. If the endpoint
  // fails, ARCHETYPES stays empty and the sheet shows its empty-state message.
  function loadHomeLibrary() {
    APP.fetchJSON("/api/knowledge/archetypes").then(function (lib) {
      HOME_TIERS = (lib && Array.isArray(lib.tiers)) ? lib.tiers : [];
      ARCHETYPES = (lib && Array.isArray(lib.archetypes)) ? lib.archetypes : [];
    }).catch(function () { /* empty-state handled in openHomeSheet */ });
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
        : m === "staging"
          ? "furnish & decorate only — every existing surface stays untouched"
          : "keep layout, walls & cabinets — restyle only";
      // Re-compose the render prompt under the new preservation clause if the
      // customer has already said something (so the mode flip is visible now).
      if (st.messages.some(function (mm) { return mm.role === "user"; })) {
        var label = m === "remodel" ? "Remodel" : m === "staging" ? "Virtual Staging" : "Redecorate";
        refreshBrief("Switched to " + label + " — updated the render instruction below.");
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
    var camInput = document.getElementById("dzFileCam");   // camera (capture=environment)
    var rollInput = document.getElementById("dzFileRoll"); // camera roll / file picker
    var drop = document.getElementById("dzDrop");
    // Both hidden inputs funnel through usePhoto; clear value first so re-picking
    // the same file still fires change.
    function openCam() { camInput.value = ""; camInput.click(); }
    function openRoll() { rollInput.value = ""; rollInput.click(); }
    camInput.addEventListener("change", function () {
      if (camInput.files && camInput.files[0]) usePhoto(camInput.files[0]);
    });
    rollInput.addEventListener("change", function () {
      if (rollInput.files && rollInput.files[0]) usePhoto(rollInput.files[0]);
    });
    // Clicking the general hero area opens the ROLL picker (the more common
    // intent — most people already have the photo). The two explicit buttons
    // stopPropagation so they don't also fire this area click.
    drop.addEventListener("click", openRoll);
    drop.addEventListener("keydown", function (e) {
      // Only act when the hero itself is focused — Enter/Space on the inner
      // Take-photo button must keep its native activation (keyboard camera path).
      if (e.target !== drop) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRoll(); }
    });
    document.getElementById("dzPickCam").addEventListener("click", function (e) { e.stopPropagation(); openCam(); });
    document.getElementById("dzPickRoll").addEventListener("click", function (e) { e.stopPropagation(); openRoll(); });
    // Corner replace buttons (shown once a photo is loaded) — same two paths.
    document.getElementById("dzReplaceRoll").addEventListener("click", openRoll);
    document.getElementById("dzReplaceCam").addEventListener("click", openCam);
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
    // The handler removes ITSELF by closure (not st._onPaste — st is reassigned
    // on every render, so the old reference would remove the NEW handler and
    // stack stale listeners: duplicate usePhoto per revisit).
    var onPaste = function (e) {
      if (!document.getElementById("dz") || st._onPaste !== onPaste) {
        document.removeEventListener("paste", onPaste);
        return;
      }
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image") === 0) {
          var f = items[i].getAsFile();
          if (f) { usePhoto(f); break; }
        }
      }
    };
    st._onPaste = onPaste;
    document.addEventListener("paste", onPaste);
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
    document.getElementById("dzReplace").style.display = "flex";
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
    updatePromptPreview();
    syncMatBtn();
  }

  // ── Collapsible render-instruction panel ──
  // Collapsed by default; the open/closed choice persists in localStorage.
  function isPromptOpen() {
    try { return localStorage.getItem("dzPromptOpen") === "1"; } catch (e) { return false; }
  }
  function applyPromptOpen(open) {
    var box = document.getElementById("dzPrompt");
    var chev = document.getElementById("dzPromptChev");
    var note = document.getElementById("dzPromptNote");
    var prev = document.getElementById("dzPromptPreview");
    var copy = document.getElementById("dzCopyPrompt");
    var toggle = document.getElementById("dzPromptToggle");
    if (box) box.style.display = open ? "" : "none";
    if (chev) chev.textContent = open ? "▾" : "▸";
    if (note) note.style.display = open ? "" : "none";
    if (prev) prev.style.display = open ? "none" : "";
    if (copy) copy.style.display = open ? "" : "none";
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    try { localStorage.setItem("dzPromptOpen", open ? "1" : "0"); } catch (e) {}
  }
  // One-line muted preview of the current instruction (collapsed row). textContent
  // is safe (no HTML injection) and CSS truncates with an ellipsis.
  function updatePromptPreview() {
    var prev = document.getElementById("dzPromptPreview");
    if (!prev) return;
    var box = document.getElementById("dzPrompt");
    var text = (box && box.value) || st.renderPrompt || "";
    prev.textContent = text || "Not composed yet — add a photo and tell me the look.";
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
    box.addEventListener("input", function () { st.renderPrompt = box.value; updatePromptPreview(); syncMatBtn(); });
    document.getElementById("dzCopyPrompt").addEventListener("click", function (e) {
      e.stopPropagation();   // don't let Copy collapse the panel
      copyText(currentPrompt(), "Render instruction copied");
    });
    var toggle = document.getElementById("dzPromptToggle");
    toggle.addEventListener("click", function (e) {
      if (e.target.closest("#dzCopyPrompt")) return;   // Copy handles itself
      applyPromptOpen(!isPromptOpen());
    });
    toggle.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyPromptOpen(!isPromptOpen()); }
    });
    applyPromptOpen(isPromptOpen());   // restore persisted state (default closed)
    updatePromptPreview();
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
    // New render invalidates the per-option materials cache + any in-flight
    // estimate, and resets the materials card to its empty state.
    st.matCache = {};
    st.matSeq++;
    var matBody = document.getElementById("dzMatBody");
    if (matBody) matBody.innerHTML = '<div class="muted" style="font-size:0.82rem">Rendering… I\'ll read the materials off the option you pick (beta).</div>';
    var matOpts = document.getElementById("dzMatOpts");
    if (matOpts) { matOpts.style.display = "none"; matOpts.innerHTML = ""; }
    var matBasis = document.getElementById("dzMatBasis");
    if (matBasis) matBasis.textContent = "";
    result.innerHTML =
      '<div class="card"><div class="muted" style="display:flex;align-items:center;gap:0.5rem">' +
        '<span class="dz-typing" style="padding:0.3rem 0.5rem"><i></i><i></i><i></i></span> ' +
        (want > 1 ? "Rendering " + want + " options" : "Rendering your redesign") +
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
      resetMatCard();
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
    // 3-up labeled option cards under the hero slider. Labeled by ACTUAL count
    // (the server may return fewer than requested via Promise.allSettled), so
    // A/B/C track what came back — no empty cards. One variation → no grid.
    var opts = "";
    if (st.variationUrls.length > 1) {
      opts = '<div class="dz-opts">' + st.variationUrls.map(function (u, i) {
        var letter = String.fromCharCode(65 + i);
        return '<button type="button" class="dz-opt' + (u === st.genAfterUrl ? " sel" : "") + '" data-u="' + APP.esc(u) + '">' +
          '<span class="opt-img"><img src="' + APP.esc(u) + '" alt="Option ' + letter + '" loading="lazy" /></span>' +
          '<span class="opt-lab">Option ' + letter + '</span>' +
        '</button>';
      }).join("") + '</div>';
    }
    result.innerHTML =
      '<div class="card">' +
        '<h2>Your redesign' + (badge ? ' <span class="muted" style="font-weight:600;font-size:0.7rem">via ' + badge + '</span>' : "") + '</h2>' +
        '<div id="dzCmpHost">' + cmpHtml(st.photoUrl, st.genAfterUrl, aiBadge) + '</div>' +
        opts +
        '<div class="dz-coach">Check: window positions, door placement, furniture scale — regenerate if anything moved. Images are AI concept visualizations — always present them as concepts, not photos.</div>' +
      '</div>';
    wireCmp(document.getElementById("dzCmpHost"));
    var grid = result.querySelector(".dz-opts");
    if (grid) grid.addEventListener("click", function (e) {
      var t = e.target.closest(".dz-opt");
      if (!t) return;
      selectOption(t.getAttribute("data-u"));
    });
    renderSaveCard();
    // Auto-rough the materials from the just-rendered option A (beta).
    estimateMaterials();
  }

  // ONE source of truth for switching the selected option (A/B/C). Both entry
  // points — an option card in the result grid and an option chip in the
  // materials head — funnel through here so the result selection, hero slider,
  // save-note, materials head chips and materials read can never drift.
  function selectOption(url) {
    if (!url) return;
    st.genAfterUrl = url;
    var aiBadge = aiBadgeText(st.mode);
    var grid = document.querySelector("#dzResult .dz-opts");
    if (grid) Array.prototype.forEach.call(grid.querySelectorAll(".dz-opt"), function (x) {
      x.classList.toggle("sel", x.getAttribute("data-u") === url);
    });
    var host = document.getElementById("dzCmpHost");
    if (host) { host.innerHTML = cmpHtml(st.photoUrl, st.genAfterUrl, aiBadge); wireCmp(host); }
    var note = document.getElementById("dzSaveNote");
    if (note) note.textContent = savedOptionLabel();
    renderMatOpts();
    estimateMaterials(); // cache-instant if this option was read before
  }

  // A failed/bridged generate must not leave the materials card stuck on the
  // "Rendering…" placeholder with a dead button (review-loop finding).
  function resetMatCard() {
    var matBody = document.getElementById("dzMatBody");
    if (matBody) matBody.innerHTML = '<div class="muted" style="font-size:0.82rem">Generate a design first — then I\'ll read the materials off the option you pick (beta).</div>';
    var matBasis = document.getElementById("dzMatBasis");
    if (matBasis) matBasis.textContent = "";
    renderMatOpts();
    syncMatBtn();
  }

  function renderBridge(r) {
    resetMatCard();
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

  /* ============================ MATERIALS & ROUGH COSTS (BETA) ============================ */

  // The "Estimate materials" button is enabled once a real render instruction
  // exists (composed from chat, or typed by hand) — not the empty-state fallback.
  function syncMatBtn() {
    var btn = document.getElementById("dzMatBtn");
    if (!btn) return;
    var box = document.getElementById("dzPrompt");
    var has = !!((box && box.value.trim()) || (st.renderPrompt && st.renderPrompt.trim()));
    btn.disabled = !has;
  }

  function wireMaterials() {
    var btn = document.getElementById("dzMatBtn");
    if (btn) btn.addEventListener("click", estimateMaterials);
    var seg = document.getElementById("dzMatOpts");
    if (seg) seg.addEventListener("click", function (e) {
      var t = e.target.closest(".dz-mat-opt");
      if (!t) return;
      selectOption(t.getAttribute("data-u")); // same effect as the result grid
    });
    syncMatBtn();
  }

  // Compact A/B/C chips in the materials head, shown only when there are 2+
  // variations, synced to the selected option. Reuses the .dz-seg segmented look.
  function renderMatOpts() {
    var seg = document.getElementById("dzMatOpts");
    if (!seg) return;
    if (!(st.variationUrls && st.variationUrls.length > 1)) { seg.style.display = "none"; seg.innerHTML = ""; return; }
    seg.style.display = "";
    seg.innerHTML = st.variationUrls.map(function (u, i) {
      var letter = String.fromCharCode(65 + i);
      return '<button type="button" class="dz-mat-opt' + (u === st.genAfterUrl ? " on" : "") + '" data-u="' + APP.esc(u) + '">' + letter + '</button>';
    }).join("");
  }

  // Muted line next to the BETA pill telling the customer where the numbers came
  // from — which option, and whether they were read from the rendered image or
  // the text brief. Mirrors the server's basis field.
  function setMatBasisLabel(r) {
    var el = document.getElementById("dzMatBasis");
    if (!el) return;
    var basis = r && r.basis;
    var multi = st.variationUrls && st.variationUrls.length > 1;
    var txt = "";
    if (basis === "image") {
      if (multi) {
        var idx = st.variationUrls.indexOf(st.genAfterUrl);
        var letter = idx >= 0 ? String.fromCharCode(65 + idx) : "";
        txt = (letter ? "Option " + letter + " — " : "") + "read from the rendered image";
      } else {
        txt = "read from the rendered image";
      }
    } else if (basis === "brief") {
      txt = "read from the design brief";
    }
    el.textContent = txt;
  }

  // POST the current render instruction + chat to /design-materials, PER SELECTED
  // OPTION. Passes the selected option's /uploads path (st.genAfterUrl) so the
  // server reads materials from what was actually rendered in THAT image; null in
  // the attach-Gemini flow -> server falls back to the text brief. Cache-instant
  // for an option already read this session. Stale responses (a newer switch
  // arrived first) are dropped via st.matSeq. Called on the button, on every
  // option switch, and automatically after a successful in-app generate.
  function estimateMaterials() {
    var body = document.getElementById("dzMatBody");
    if (!body) return;
    renderMatOpts();
    var url = st.genAfterUrl || null;
    // Cache key includes the brief — editing the render instruction must not
    // serve a stale read of the old design (review-loop finding).
    var cacheKey = url ? url + "|" + currentPrompt().slice(0, 200) : null;
    // Cache hit -> render instantly, no network call. Still bump matSeq so any
    // OLDER in-flight estimate for a different option can't land afterward and
    // overwrite this card (the exact out-of-order case the guard exists for),
    // and re-sync the button in case that in-flight request had disabled it.
    if (cacheKey && st.matCache[cacheKey]) {
      st.matSeq++;
      syncMatBtn();
      renderMaterials(st.matCache[cacheKey]);
      return;
    }
    var btn = document.getElementById("dzMatBtn");
    if (btn) btn.disabled = true;
    body.innerHTML =
      '<div class="muted" style="display:flex;align-items:center;gap:0.5rem;font-size:0.82rem">' +
        '<span class="dz-typing" style="padding:0.3rem 0.5rem"><i></i><i></i><i></i></span> ' +
        'Reading the design + pricing… ~5-10s</div>';
    var seq = ++st.matSeq;
    APP.fetchJSON("/api/knowledge/design-materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ renderPrompt: currentPrompt(), messages: st.messages, imageUrl: url || undefined })
    }).then(function (r) {
      if (seq !== st.matSeq) return; // a newer switch won — drop this
      syncMatBtn();
      // Cache only successful per-image reads, keyed by option url + brief.
      if (cacheKey && r && r.basis === "image" && Array.isArray(r.items) && r.items.length) st.matCache[cacheKey] = r;
      renderMaterials(r || {});
    }).catch(function (e) {
      if (seq !== st.matSeq) return;
      syncMatBtn();
      body.innerHTML = '<div class="muted" style="font-size:0.82rem">Couldn\'t estimate materials right now (' + APP.esc(e.message) + '). Try again.</div>';
    });
  }

  function renderMaterials(r) {
    var body = document.getElementById("dzMatBody");
    if (!body) return;
    setMatBasisLabel(r);
    if (r.configured === false) {
      body.innerHTML = '<div class="muted" style="font-size:0.82rem">' + APP.esc(r.message || "Materials estimate isn't configured yet.") + '</div>';
      return;
    }
    var items = Array.isArray(r.items) ? r.items : [];
    if (!items.length) {
      var reason = r.error ? " (" + APP.esc(r.error) + ")" : "";
      body.innerHTML = '<div class="muted" style="font-size:0.82rem">Couldn\'t read materials from this design yet' + reason + '. Add a bit more detail to the design and try again.</div>';
      return;
    }
    var rows = items.map(function (it) {
      var lo = Number(it.low) || 0, hi = Number(it.high) || 0;
      var range = (lo && hi) ? (money(lo) + "–" + money(hi))
        : (lo ? "from " + money(lo) : (hi ? "up to " + money(hi) : "—"));
      var isBook = String(it.source || "") === "price book";
      var tag = isBook
        ? '<span class="pill green" title="Grounded in our price book\'s blended range">price book</span>'
        : '<span class="pill" title="Concept-level model estimate — no price-book match">rough</span>';
      return '<div class="dz-mat-row">' +
          '<div class="dz-mat-name"><b>' + APP.esc(it.name || "") + '</b>' +
            (it.spec ? '<span class="dz-mat-spec">' + APP.esc(it.spec) + '</span>' : "") +
          '</div>' +
          '<div class="dz-mat-unit">' + APP.esc(it.unit || "") + '</div>' +
          '<div class="dz-mat-cost">' + range + '</div>' +
          '<div class="dz-mat-tag">' + tag + '</div>' +
        '</div>';
    }).join("");
    var disclaimer = r.disclaimer ? APP.esc(r.disclaimer) + " " : "";
    body.innerHTML =
      '<div class="dz-mat-rows">' + rows + '</div>' +
      '<div class="dz-mat-note">' + disclaimer +
        'Rough ranges per unit — quantities depend on the room; use Bid Lab for a real number.</div>';
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
    if (mode === "remodel") return "Design concept — layout may vary";
    if (mode === "staging") return "AI concept — virtually staged";
    return "AI concept";
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

  // Which generated option is being saved as the "after" — names the selected
  // Option letter when there are multiple; plain wording for a single render.
  function savedOptionLabel() {
    if (st.variationUrls.length > 1) {
      var idx = st.variationUrls.indexOf(st.genAfterUrl);
      if (idx < 0) idx = 0;
      return 'Using Option ' + String.fromCharCode(65 + idx) + ' as the "after".';
    }
    return 'Using the render generated above as the "after".';
  }

  function renderSaveCard() {
    var result = document.getElementById("dzResult");
    var haveGen = !!st.genAfterUrl;
    var card = document.createElement("div");
    card.className = "card";
    card.id = "dzSaveCard";
    card.style.marginTop = "0.9rem";
    card.innerHTML =
      '<h2>Submit for designer review</h2>' +
      '<div class="muted" style="font-size:0.8rem;margin-bottom:0.7rem">A designer checks buildability and rough price. Approved concepts join the client Showcase and can be attached to a Scope of Work.</div>' +
      '<div class="dz-proj" style="margin-bottom:0.7rem">' +
        '<span class="muted" style="font-size:0.8rem">Project</span>' +
        '<select id="dzProj">' + projectOptionsHtml() + "</select>" +
      '</div>' +
      '<input type="text" id="dzTitle" maxlength="120" placeholder="Concept title — e.g. Kitchen · white shaker + quartz" style="width:100%;border:1px solid #d8dee8;border-radius:8px;padding:0.5rem 0.65rem;font:inherit;font-size:0.88rem;background:#f8fafc;margin-bottom:0.7rem" />' +
      (haveGen
        ? '<div class="muted" id="dzSaveNote" style="font-size:0.82rem;margin-bottom:0.6rem">' + APP.esc(savedOptionLabel()) + '</div>'
        : '<label id="dzAttachZone" for="dzAttachFile">Attach the render — drop the image Gemini made, or tap to choose it.</label>' +
          '<input type="file" id="dzAttachFile" accept="image/*" style="display:none" />' +
          '<div id="dzAttachPrev" style="margin-top:0.6rem"></div>') +
      '<div style="margin-top:0.7rem"><button class="btn primary" id="dzSave" type="button">📤 Submit for review</button>' +
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
    if (mode === "remodel") return "Remodel concept";
    if (mode === "staging") return "Virtual staging concept";
    return "Redecorate concept";
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
    msg.textContent = "Submitting…";
    var afterSrc = st.genAfterUrl || st.attachUrl;
    var titleBox = document.getElementById("dzTitle");
    var title = (titleBox && titleBox.value.trim()) ||
      (st.renderPrompt ? st.renderPrompt.split(".")[0].slice(0, 120) : "Design concept");
    Promise.all([
      uploadImage(st.photoFile),
      compositeAiCaption(afterSrc, st.mode).then(function (blob) { return uploadImage(blob); })
    ]).then(function (urls) {
      return APP.fetchJSON("/api/design/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: st.projectId,
          projectName: st.projectName,
          title: title,
          style: st.styleSel,
          mode: st.mode,
          renderPrompt: currentPrompt(),
          beforeUrl: urls[0],
          afterUrl: urls[1]
        })
      });
    }).then(function () {
      msg.textContent = "Submitted for designer review ✓";
      saveBtn.disabled = false;
      refreshReviewBadge();
      loadHistory();
    }).catch(function (e) {
      msg.textContent = "Submit failed: " + e.message;
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

  // Draft/Approved split (Ori, 2026-07-20): drafts = anything not yet approved
  // (pending, changes requested, rejected — the status pill tells them apart);
  // approved = designer-approved concepts. Selection persists across reloads.
  var histView = "";   // "" = auto: drafts if any exist, else approved

  function loadHistory() {
    var host = document.getElementById("dzHistory");
    if (!host) return;
    host.innerHTML = '<div class="card"><h2>Recent submissions</h2><div class="muted" style="font-size:0.8rem">Loading…</div></div>';
    APP.fetchJSON("/api/design/renders?projectId=" + encodeURIComponent(st.projectId)).then(function (rows) {
      rows = rows || [];
      var drafts = rows.filter(function (r) { return r.status !== "approved"; });
      var approved = rows.filter(function (r) { return r.status === "approved"; });
      var view = histView || (drafts.length ? "draft" : "approved");
      var shown = view === "approved" ? approved : drafts;
      var picker =
        '<div style="display:flex;flex-wrap:wrap;gap:0.7rem;align-items:center;margin-bottom:0.7rem">' +
          '<div class="dz-seg" id="dzHistView">' +
            '<button type="button" data-v="draft"' + (view === "draft" ? ' class="on"' : "") + '>🕓 Drafts (' + drafts.length + ')</button>' +
            '<button type="button" data-v="approved"' + (view === "approved" ? ' class="on"' : "") + '>✅ Approved (' + approved.length + ')</button>' +
          '</div>' +
          '<div class="dz-proj"><span class="muted" style="font-size:0.8rem">Project</span>' +
          '<select id="dzHistProj">' + projectOptionsHtml() + "</select></div>" +
        '</div>';
      var body;
      if (!rows.length) {
        body = '<div class="empty">Nothing submitted for this project yet. Generate a redesign above and submit it for designer review.</div>';
      } else if (!shown.length) {
        body = '<div class="empty">' + (view === "approved"
          ? "No approved concepts for this project yet — approve drafts in the Designer review tab."
          : "No drafts — everything here has been reviewed.") + '</div>';
      } else {
        body = '<div class="dz-hstrip">' + shown.map(historyCard).join("") + "</div>";
      }
      host.innerHTML = '<div class="card"><h2>Recent submissions</h2>' + picker + body + '</div>';
      var seg = document.getElementById("dzHistView");
      if (seg) seg.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-v]");
        if (!b) return;
        histView = b.getAttribute("data-v");
        loadHistory();
      });
      var sel = document.getElementById("dzHistProj");
      if (sel) sel.addEventListener("change", function (e) { pickProject(e.target); loadHistory(); });
      var strip = host.querySelector(".dz-hstrip");
      if (strip) strip.addEventListener("click", function (e) {
        var c = e.target.closest(".dz-hcard");
        if (c) openViewer(c.dataset.before, c.dataset.after, c.dataset.cap, c.dataset.mode);
      });
    }).catch(function (e) {
      host.innerHTML = '<div class="card"><h2>Recent submissions</h2><div class="empty">Couldn\'t load submissions: ' + APP.esc(e.message) + "</div></div>";
    });
  }

  function statusPill(status) {
    var labels = { pending: "Pending review", approved: "Approved", changes: "Changes requested", rejected: "Rejected" };
    var key = labels[status] ? status : "pending";
    return '<span class="dz-status ' + key + '">' + labels[key] + '</span>';
  }

  function historyCard(entry) {
    return '<div class="dz-hcard" data-before="' + APP.esc(entry.beforeUrl) + '" data-after="' + APP.esc(entry.afterUrl) + '" data-cap="' + APP.esc(entry.title || "Design concept") + '" data-mode="' + APP.esc(entry.mode || "redecorate") + '">' +
      '<div class="pair">' +
        '<img src="' + APP.esc(entry.beforeUrl) + '" alt="Before" loading="lazy" />' +
        '<img src="' + APP.esc(entry.afterUrl) + '" alt="After" loading="lazy" />' +
      '</div>' +
      '<div class="cap" style="display:flex;align-items:center;gap:0.4rem;justify-content:space-between"><span style="overflow:hidden;text-overflow:ellipsis">' + APP.esc(entry.title || "Design concept") + '</span>' + statusPill(entry.status) + '</div>' +
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

  /* ============================ DESIGNER REVIEW PANE ============================ */

  var reviewFilter = "pending";

  function loadReviewPane() {
    var pane = document.getElementById("dzPaneReview");
    if (!pane) return;
    pane.innerHTML = '<div class="card"><div class="muted" style="font-size:0.85rem">Loading review queue…</div></div>';
    APP.fetchJSON("/api/design/renders" + (reviewFilter === "all" ? "" : "?status=" + reviewFilter)).then(function (rows) {
      var seg =
        '<div class="dz-seg" id="dzRvFilter" style="margin-bottom:1rem">' +
          ["pending", "changes", "approved", "rejected", "all"].map(function (f) {
            var labels = { pending: "Pending", changes: "Changes", approved: "Approved", rejected: "Rejected", all: "All" };
            return '<button type="button" data-f="' + f + '"' + (f === reviewFilter ? ' class="on"' : "") + '>' + labels[f] + '</button>';
          }).join("") +
        '</div>';
      var intro = '<div class="muted" style="font-size:0.82rem;margin:0 0 0.8rem">Review each concept for buildability. Approving marks it <b>render-approved</b> — it joins the client Showcase (optional) and can be attached to a Scope of Work with your feasibility read and rough price range.</div>';
      var body = rows && rows.length
        ? rows.map(reviewCardHtml).join("")
        : '<div class="empty">Nothing here. ' + (reviewFilter === "pending" ? "New Studio submissions land in this queue." : "") + '</div>';
      pane.innerHTML = intro + seg + body;

      document.getElementById("dzRvFilter").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-f]");
        if (!b) return;
        reviewFilter = b.getAttribute("data-f");
        loadReviewPane();
      });
      Array.prototype.forEach.call(pane.querySelectorAll(".dz-rv .dz-cmp"), wireCmp);
      pane.onclick = onReviewClick;   // assignment (not addEventListener) — the pane reloads often and must never stack handlers
    }).catch(function (e) {
      pane.innerHTML = '<div class="card"><div class="empty">Couldn\'t load the review queue: ' + APP.esc(e.message) + '</div></div>';
    });
  }

  function feasLabel(f) {
    return { high: "High — builds as shown", medium: "Medium — minor adjustments", low: "Low — significant changes needed" }[f] || f;
  }

  function reviewCardHtml(r) {
    var when = r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
    var reviewed = r.review && r.review.reviewedAt;
    var openForm = r.status === "pending" || r.status === "changes";
    var priceStr = r.review && (r.review.priceLow || r.review.priceHigh)
      ? money(r.review.priceLow) + "–" + money(r.review.priceHigh) : "";
    return '<div class="dz-rv" data-id="' + APP.esc(r.id) + '">' +
      '<div class="dz-rv-head">' +
        '<b>' + APP.esc(r.title || "Design concept") + '</b>' + statusPill(r.status) +
        '<span class="meta">' + APP.esc([r.projectName, r.style, r.mode, when].filter(Boolean).join(" · ")) + '</span>' +
      '</div>' +
      '<div class="dz-rv-grid">' +
        '<div>' +
          cmpHtml(r.beforeUrl, r.afterUrl, aiBadgeText(r.mode)) +
          (r.renderPrompt ? '<div class="dz-rv-prompt">' + APP.esc(r.renderPrompt) + '</div>' : "") +
        '</div>' +
        '<div class="dz-rv-form">' +
          (reviewed
            ? '<div class="dz-calm" style="margin-bottom:0.6rem"><b>' + APP.esc(r.review.reviewedBy || "Designer") + '</b> · ' +
                APP.esc(new Date(r.review.reviewedAt).toLocaleDateString()) +
                (r.review.feasibility ? '<br />Feasibility: <b>' + APP.esc(feasLabel(r.review.feasibility)) + '</b>' : "") +
                (priceStr ? '<br />Rough range: <b>' + priceStr + '</b>' : "") +
                (r.review.notes ? '<br />' + APP.esc(r.review.notes) : "") + '</div>'
            : "") +
          (openForm ?
            '<span class="k">Feasibility (can we build this as shown?)</span>' +
            '<div class="dz-seg rv-feas">' +
              '<button type="button" data-feas="high">High</button>' +
              '<button type="button" data-feas="medium">Medium</button>' +
              '<button type="button" data-feas="low">Low</button>' +
            '</div>' +
            '<span class="k">Rough build price range ($)</span>' +
            '<div class="dz-rv-price">' +
              '<input type="number" class="rv-lo" min="0" step="500" placeholder="Low — e.g. 18000" />' +
              '<input type="number" class="rv-hi" min="0" step="500" placeholder="High — e.g. 26000" />' +
            '</div>' +
            '<span class="k">Review notes (feasibility, price drivers, what to watch)</span>' +
            '<textarea class="rv-notes" placeholder="e.g. Island as rendered needs a new circuit; window trim change is cosmetic only."></textarea>' +
            '<span class="k">Reviewer</span>' +
            '<input type="text" class="rv-by" placeholder="Your name" value="' + APP.esc(localStorage.getItem("dzReviewer") || "") + '" />' +
            '<div class="dz-rv-actions">' +
              '<button class="btn primary rv-approve" type="button">✅ Approve render</button>' +
              '<label class="dz-chk"><input type="checkbox" class="rv-showcase" checked /> add to Showcase</label>' +
              '<button class="btn rv-changes" type="button">🔁 Request changes</button>' +
              '<button class="btn rv-reject" type="button">❌ Reject</button>' +
              '<span class="msg"></span>' +
            '</div>'
            :
            '<div class="dz-rv-actions">' +
              (r.status === "approved"
                ? '<button class="btn primary rv-tosow" type="button">📋 Add to Scope of Work</button>' +
                  '<label class="dz-chk"><input type="checkbox" class="rv-showcase-toggle"' + (r.showcase ? " checked" : "") + ' /> in Showcase</label>'
                : "") +
              '<button class="btn rv-delete" type="button">🗑️ Delete</button>' +
              '<span class="msg"></span>' +
            '</div>') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function onReviewClick(e) {
    var card = e.target.closest(".dz-rv");
    if (!card) return;
    var id = card.getAttribute("data-id");
    var feasBtn = e.target.closest("button[data-feas]");
    if (feasBtn) {
      Array.prototype.forEach.call(card.querySelectorAll("button[data-feas]"), function (x) {
        x.classList.toggle("on", x === feasBtn);
      });
      return;
    }
    if (e.target.closest(".rv-approve")) return submitReview(card, id, "approve");
    if (e.target.closest(".rv-changes")) return submitReview(card, id, "changes");
    if (e.target.closest(".rv-reject")) return submitReview(card, id, "reject");
    if (e.target.closest(".rv-tosow")) return sendToSow(card, id);
    if (e.target.closest(".rv-delete")) {
      if (!window.confirm("Delete this render submission?")) return;
      APP.fetchJSON("/api/design/renders/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function () { loadReviewPane(); refreshReviewBadge(); })
        .catch(function (err) { APP.toast("Delete failed: " + err.message); });
      return;
    }
    var tgl = e.target.closest(".rv-showcase-toggle");
    if (tgl) {
      APP.fetchJSON("/api/design/renders/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showcase: tgl.checked })
      }).then(function () { APP.toast(tgl.checked ? "Added to Showcase" : "Removed from Showcase"); })
        .catch(function (err) { APP.toast("Update failed: " + err.message); });
    }
  }

  function submitReview(card, id, decision) {
    var msg = card.querySelector(".msg");
    var feasEl = card.querySelector("button[data-feas].on");
    var feasibility = feasEl ? feasEl.getAttribute("data-feas") : "";
    if (decision === "approve" && !feasibility) {
      msg.textContent = "Pick a feasibility rating before approving.";
      return;
    }
    var by = (card.querySelector(".rv-by") || {}).value || "";
    if (by.trim()) { try { localStorage.setItem("dzReviewer", by.trim()); } catch (e) {} }
    msg.textContent = "Saving…";
    APP.fetchJSON("/api/design/renders/" + encodeURIComponent(id) + "/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: decision,
        feasibility: feasibility,
        priceLow: (card.querySelector(".rv-lo") || {}).value || 0,
        priceHigh: (card.querySelector(".rv-hi") || {}).value || 0,
        notes: (card.querySelector(".rv-notes") || {}).value || "",
        reviewedBy: by,
        showcase: !!(card.querySelector(".rv-showcase") || {}).checked
      })
    }).then(function () {
      APP.toast(decision === "approve" ? "Render approved ✓" : decision === "reject" ? "Render rejected" : "Changes requested");
      loadReviewPane();
      refreshReviewBadge();
    }).catch(function (err) {
      msg.textContent = "Failed: " + err.message;
    });
  }

  // Hand an approved render to the Scope of Work builder (picked up on #/sow).
  function sendToSow(card, id) {
    APP.fetchJSON("/api/design/renders?status=approved").then(function (rows) {
      var r = (rows || []).filter(function (x) { return x.id === id; })[0];
      if (!r) { APP.toast("Couldn't load that render."); return; }
      try {
        localStorage.setItem("sowAttachRender", JSON.stringify({
          renderId: r.id, title: r.title, style: r.style,
          beforeUrl: r.beforeUrl, afterUrl: r.afterUrl,
          feasibility: (r.review && r.review.feasibility) || "",
          priceLow: (r.review && r.review.priceLow) || 0,
          priceHigh: (r.review && r.review.priceHigh) || 0
        }));
      } catch (e) {}
      window.location.hash = "#/sow";
    }).catch(function (err) { APP.toast("Failed: " + err.message); });
  }

  /* ============================ SHOWCASE PANE ============================ */

  function loadShowcasePane() {
    var pane = document.getElementById("dzPaneShowcase");
    if (!pane) return;
    pane.innerHTML = '<div class="card"><div class="muted" style="font-size:0.85rem">Loading showcase…</div></div>';
    APP.fetchJSON("/api/design/renders?showcase=1").then(function (rows) {
      var banner =
        '<div class="dz-banner"><span class="ico">🤖</span><span><b>Every image below is an AI concept.</b> ' +
        APP.esc(aiDisclaimer) + '</span></div>';
      var intro =
        '<div class="viewhead" style="margin-bottom:0.5rem"><h1 style="font-size:1.15rem">What we can do with <i>your</i> space</h1></div>' +
        '<div class="muted" style="font-size:0.85rem;margin-bottom:1rem">Designer-approved concepts from real client photos — each reviewed for buildability with a rough budget range. Tap any card to compare before / after.</div>';
      var grid = rows && rows.length
        ? '<div class="dz-sc-grid">' + rows.map(showcaseCardHtml).join("") + '</div>'
        : '<div class="empty">No approved showcase concepts yet — approve renders in the Designer review tab and they appear here.</div>';
      pane.innerHTML = intro + banner + grid;
      pane.onclick = function (e) {   // assignment, not addEventListener — pane reloads on every activation
        var c = e.target.closest(".dz-sc");
        if (c) openViewer(c.dataset.before, c.dataset.after, c.dataset.cap, c.dataset.mode);
      };
    }).catch(function (e) {
      pane.innerHTML = '<div class="card"><div class="empty">Couldn\'t load the showcase: ' + APP.esc(e.message) + '</div></div>';
    });
  }

  function showcaseCardHtml(r) {
    var price = r.review && (r.review.priceLow || r.review.priceHigh)
      ? '<span class="price">Typically ' + money(r.review.priceLow) + "–" + money(r.review.priceHigh) + '</span>' : "";
    var sub = [r.roomType, r.style, r.mode === "remodel" ? "Remodel" : "Redecorate"].filter(Boolean).join(" · ");
    return '<button type="button" class="dz-sc" data-before="' + APP.esc(r.beforeUrl) + '" data-after="' + APP.esc(r.afterUrl) + '" data-cap="' + APP.esc(r.title || "Design concept") + '" data-mode="' + APP.esc(r.mode || "redecorate") + '">' +
      '<span class="im">' +
        '<img src="' + APP.esc(r.afterUrl) + '" alt="' + APP.esc(r.title || "Design concept") + '" loading="lazy" />' +
        '<span class="ai">AI CONCEPT</span>' +
        (r.style ? '<span class="st">' + APP.esc(r.style) + '</span>' : "") +
      '</span>' +
      '<span class="bd">' +
        '<b>' + APP.esc(r.title || "Design concept") + '</b>' +
        (sub ? '<span class="sub2">' + APP.esc(sub) + '</span>' : "") +
        price +
      '</span>' +
    '</button>';
  }

  APP.registerView("design", { title: "Design", render: render });
})();
