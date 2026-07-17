// Construction Notes knowledge base — RAG over Ori's Drive folder (whiteboards,
// client decks, scope-of-work PDF). Chunks live in Mongo (knowledgeChunks),
// images reference Google Drive thumbnails (render for the logged-in owner).
// Retrieval is lexical (term overlap + title/topic boost) — the corpus is small
// and domain terms are distinctive, so no embedding infra is needed.
// Answering spawns the local claude CLI (haiku) like research-chat; if the CLI
// fails, the endpoint degrades to returning the retrieved context directly.
const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { parseCliJson, logTokenUsage } = require("./tokenlog");

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "what", "which", "where", "when",
  "how", "does", "do", "is", "are", "was", "were", "will", "would", "should",
  "could", "can", "a", "an", "of", "to", "in", "on", "at", "it", "my", "our",
  "your", "you", "we", "they", "need", "needs", "about", "into", "from"
]);

function tokenize(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function scoreChunk(chunk, terms) {
  if (!terms.length) return 0;
  const bodyTokens = new Set(chunk.tokens || []);
  const titleTokens = new Set(tokenize(chunk.title));
  const topicTokens = new Set((chunk.topics || []).flatMap((topic) => tokenize(topic)));
  let score = 0;
  for (const term of terms) {
    if (titleTokens.has(term)) score += 5;
    if (topicTokens.has(term)) score += 4;
    if (bodyTokens.has(term)) score += 2;
    else if ([...bodyTokens].some((token) => token.startsWith(term) || term.startsWith(token))) score += 1;
  }
  return score;
}

function scoreImage(image, terms, topChunkTopics) {
  const topicTokens = new Set((image.topics || []).flatMap((topic) => tokenize(topic)).concat(tokenize(image.title)));
  let score = 0;
  for (const term of terms) if (topicTokens.has(term)) score += 3;
  for (const topic of topChunkTopics) if ((image.topics || []).includes(topic)) score += 2;
  return score;
}

function driveThumb(fileId, width = 1200) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}
function driveView(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

// Design-style library — the single source of truth for style knowledge shared
// by the render engine (/design-brief prompt composition, /redesign, /styles
// chips) and the Q&A corpus (the same content is ingested as knowledgeChunks).
// Authored at knowledge/design-styles.json; hot-reloads on mtime change.
const STYLES_PATH = path.join(__dirname, "knowledge", "design-styles.json");
let _stylesCache = { mtimeMs: 0, data: null };
function loadStyles() {
  try {
    const stat = fs.statSync(STYLES_PATH);
    if (!_stylesCache.data || stat.mtimeMs !== _stylesCache.mtimeMs) {
      _stylesCache = { mtimeMs: stat.mtimeMs, data: JSON.parse(fs.readFileSync(STYLES_PATH, "utf8")) };
    }
    return _stylesCache.data;
  } catch (_e) {
    return null;
  }
}
// Match a style by name/alias appearing in the customer's own words.
function matchStyle(text) {
  const lib = loadStyles();
  if (!lib || !Array.isArray(lib.styles)) return null;
  const t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  let best = null;
  for (const s of lib.styles) {
    const names = [s.name, ...(s.aliases || [])].filter(Boolean);
    for (const n of names) {
      const needle = ` ${String(n).toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
      if (t.includes(needle) && (!best || needle.length > best.needleLen)) {
        best = { style: s, needleLen: needle.length };
      }
    }
  }
  return best ? best.style : null;
}

// collection is passed explicitly (same pattern as retrieve() below) since this
// function lives outside the module.exports(collection) closure.
function runClaudeCli(collection, prompt, timeoutMs = 150000, model = "claude-haiku-4-5-20251001", feature = "unknown") {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    // --strict-mcp-config with no --mcp-config: skip loading every user/project
    // MCP server at CLI startup (they're irrelevant here and cost real seconds).
    // --output-format json: gives us usage/cost/duration for the token tracker
    // (Feature 1) - parsed by tokenlog.js, with a plain-text fallback below.
    const child = spawn("claude", ["-p", "--model", model, "--output-format", "json", "--strict-mcp-config"], {
      shell: true,
      windowsHide: true,
      env: { ...process.env }
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Claude CLI timed out.")); }, timeoutMs);
    child.stdout.on("data", (data) => { out += data; });
    child.stderr.on("data", (data) => { err += data; });
    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      if (code === 0 && out.trim()) {
        const parsed = parseCliJson(out);
        if (parsed) {
          logTokenUsage(collection, { feature, model, parsed, ok: true, durationMs });
          resolve(String(parsed.result || "").trim());
        } else {
          // JSON.parse failed - fall back to treating stdout as plain text exactly like before.
          logTokenUsage(collection, { feature, model, parsed: null, ok: true, durationMs });
          resolve(out.trim());
        }
      } else {
        logTokenUsage(collection, { feature, model, parsed: null, ok: false, durationMs });
        reject(new Error(err.trim() || `Claude CLI exited ${code}`));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function retrieve(collection, question, chunkLimit = 6, imageLimit = 4) {
  const chunksColl = await collection("knowledgeChunks");
  const imagesColl = await collection("knowledgeImages");
  if (!chunksColl) return { chunks: [], images: [] };
  const terms = tokenize(question);
  const allChunks = await chunksColl.find({}).toArray();
  const rankedChunks = allChunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, chunkLimit);
  const topTopics = [...new Set(rankedChunks.flatMap((entry) => entry.chunk.topics || []))];
  const allImages = imagesColl ? await imagesColl.find({}).toArray() : [];
  const rankedImages = allImages
    .map((image) => ({ image, score: scoreImage(image, terms, topTopics) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, imageLimit);
  return {
    chunks: rankedChunks.map(({ chunk, score }) => ({
      id: chunk._id.toString(), title: chunk.title, source: chunk.source, topics: chunk.topics,
      text: chunk.text, driveUrl: chunk.driveUrl, score
    })),
    images: rankedImages.map(({ image, score }) => ({
      id: image._id.toString(), title: image.title, topics: image.topics,
      thumbUrl: driveThumb(image.fileId), fullUrl: driveThumb(image.fileId, 2000),
      driveUrl: driveView(image.fileId), score
    }))
  };
}

// ── Live pricing injector ───────────────────────────────────────────────────
// Ori: Knowledge is the source of truth for pricing too — "all the questions are
// gonna be asked, including the pricing ones." For any question that plausibly
// involves cost/price/quote/charge, or that strongly matches a price-book line,
// fetch the live /api/pricing-intel (same app, local) and fold the matching
// items + trade rates into the prompt as the authoritative $ source. Best-effort:
// an 8s timeout and any failure skip silently, leaving the prompt untouched.
const PRICING_PORT = process.env.PUBLIC_PORT || process.env.PORT || 4373;
const PRICE_QUESTION_RE = /(\bcosts?\b|\bpric(?:e|es|ed|ing)\b|\bquotes?\b|\bquoted\b|\bcharges?\b|\bcharging\b|\brates?\b|\bbudget\b|\bestimates?\b|\bexpensive\b|\bcheap\b|\bafford\b|\bmarkup\b|\blabor rate\b|\$|\bdollars?\b|\bper\s*(?:sq|square|foot|ft|lf|linear|unit)\b)/i;

function isPriceQuestion(text) {
  return PRICE_QUESTION_RE.test(String(text || ""));
}

async function fetchPricingIntel() {
  try {
    const res = await fetch(`http://localhost:${PRICING_PORT}/api/pricing-intel`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function fmtUSD(n) {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return null;
  return "$" + Math.round(v).toLocaleString("en-US");
}

// Lexically match the question (+ any extra keywords, e.g. photo scene terms)
// against price-book item names/trades and trade-rate names; return a compact
// PRICING DATA block plus flags. Caps at ~15 items and ~5 trades so the prompt
// never bloats. Reuses the same term-overlap idea as chunk retrieval.
function buildPricingBlock(data, question, extraTerms = "") {
  if (!data || !Array.isArray(data.items)) return { block: "", matched: false, strong: false };
  const terms = tokenize(`${question} ${extraTerms}`);
  if (!terms.length) return { block: "", matched: false, strong: false };
  const termSet = new Set(terms);

  const scoreText = (text) => {
    const toks = [...new Set(tokenize(text))];
    const tokSet = new Set(toks);
    let s = 0;
    for (const term of termSet) {
      if (tokSet.has(term)) s += 2;
      else if (toks.some((t) => t.startsWith(term) || term.startsWith(t))) s += 1;
    }
    return s;
  };

  const scoredItems = data.items
    .map((item) => ({ item, score: scoreText(`${item.description || ""} ${item.service || ""} ${item.trade || ""}`) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const trades = data.trades || {};
  const scoredTrades = Object.keys(trades)
    .map((name) => ({ name, t: trades[name], score: scoreText(name) }))
    .filter((entry) => entry.score > 0 && Number(entry.t.count) > 0)
    .sort((a, b) => (b.score - a.score) || (Number(b.t.count) - Number(a.t.count)))
    .slice(0, 5);

  if (!scoredItems.length && !scoredTrades.length) return { block: "", matched: false, strong: false };

  const strong = scoredItems.length > 0 && scoredItems[0].score >= 4;
  const lines = ["PRICING DATA (live from our price book + logged jobs — SOURCE OF TRUTH for any $ figure):"];
  scoredItems.forEach(({ item }) => {
    const b = item.benchmark || {};
    const lo = fmtUSD(b.lowUSD != null ? b.lowUSD : item.low);
    const hi = fmtUSD(b.highUSD != null ? b.highUSD : item.high);
    const unit = item.unit && item.unit !== "pct-of-subtotal" ? "/" + item.unit : "";
    let line = `- ${item.description || item.id} (${item.trade || "—"}):`;
    if (lo && hi) line += ` benchmark ${lo}–${hi}${unit};`;
    else if (lo) line += ` benchmark from ${lo}${unit};`;
    const obs = item.observed;
    if (obs && obs.median) line += ` our observed: ${fmtUSD(obs.median)} median (${obs.count || 0} jobs);`;
    else line += " our observed: none logged yet;";
    const bl = item.blended;
    if (bl && (bl.mid || bl.low)) line += ` blended: ${fmtUSD(bl.mid || bl.low)}`;
    lines.push(line.replace(/;\s*$/, ""));
  });
  scoredTrades.forEach(({ name, t }) => {
    lines.push(`- Trade rate — ${name}: ${fmtUSD(t.median)} median (${t.count} observations)`);
  });

  return { block: lines.join("\n"), matched: true, strong };
}

// Decide + build the pricing block for a prompt: fetch once, gate on price-intent
// OR a strong item match, so non-pricing prompts stay lean.
async function pricingContextFor(question, extraTerms = "") {
  const data = await fetchPricingIntel();
  const built = buildPricingBlock(data, question, extraTerms);
  const include = built.matched && (isPriceQuestion(`${question} ${extraTerms}`) || built.strong);
  return include ? built.block : "";
}

// Mechanical provenance guarantee. The labeling rule alone doesn't hold — the
// model stamps "(price book)" on notes-sourced figures when a notes chunk reads
// like a price ladder. So after every answer, verify each provenance label
// against the dollar figures that are actually in the injected block and
// rewrite untraceable ones to "(our notes)".
function extractDollars(text) {
  const out = new Set();
  const re = /\$\s?([\d,]+(?:\.\d+)?)\s?([kK])?/g;
  let m;
  while ((m = re.exec(String(text || "")))) {
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(n)) continue;
    if (m[2]) n *= 1000;
    out.add(n);
  }
  return out;
}
function enforcePricingLabels(answer, pricingBlock) {
  const text = String(answer || "");
  if (!/\((?:price book|our jobs)/i.test(text)) return text;
  const blockNums = extractDollars(pricingBlock);
  // A label is kept only when its sentence carries at least one $ figure that
  // literally appears in the block; otherwise it becomes "(our notes)".
  return text.replace(/([^.\n!?]*?)(\((?:price book|our jobs)[^)]{0,80}\))/gi, (full, before, label) => {
    const nums = [...extractDollars(before + " " + label)];
    return nums.some((n) => blockNums.has(n)) ? full : before + "(our notes)";
  });
}

const PRICING_INSTRUCTION = "PRICING: a PRICING DATA block is included below — it is the PRIMARY, authoritative source for ANY dollar figure (price, cost, quote, charge, rate). Quote its numbers first. LABELING RULE: the labels '(price book)' and '(our jobs)' may ONLY be attached to figures that literally appear in the PRICING DATA block — '(price book)' for its benchmark/blended ranges, '(our jobs)' for its observed medians and trade rates. A figure taken from a NOTES chunk must be labeled '(our notes)'; a figure from the web must be labeled '(web)'; if unsure of a figure's source, use no label. Only fall back to notes or web for a $ figure the block does NOT contain — and say so plainly (e.g. 'not in our price book yet'). Never let a web price silently override the block.";

module.exports = (collection) => {
  const router = express.Router();
  router.use(express.json({ limit: "5mb" }));

  // Replace the whole corpus (ingestion is idempotent-by-replacement).
  router.post("/ingest", async (req, res) => {
    try {
      const chunksColl = await collection("knowledgeChunks");
      const imagesColl = await collection("knowledgeImages");
      if (!chunksColl || !imagesColl) return res.status(503).json({ error: "MongoDB is not configured." });
      const chunks = Array.isArray(req.body.chunks) ? req.body.chunks : [];
      const images = Array.isArray(req.body.images) ? req.body.images : [];
      const now = new Date().toISOString();
      await chunksColl.deleteMany({});
      await imagesColl.deleteMany({});
      if (chunks.length) {
        await chunksColl.insertMany(chunks.map((chunk) => ({
          title: String(chunk.title || "").trim(),
          source: String(chunk.source || "").trim(),
          topics: Array.isArray(chunk.topics) ? chunk.topics : [],
          text: String(chunk.text || "").trim(),
          driveUrl: String(chunk.driveUrl || "").trim(),
          tokens: [...new Set(tokenize(`${chunk.title} ${chunk.text}`))],
          ingestedAt: now
        })));
      }
      if (images.length) {
        await imagesColl.insertMany(images.map((image) => ({
          fileId: String(image.fileId || "").trim(),
          title: String(image.title || "").trim(),
          topics: Array.isArray(image.topics) ? image.topics : [],
          ingestedAt: now
        })));
      }
      res.json({ chunks: chunks.length, images: images.length });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // Append chunks without wiping the corpus (dedupes on title).
  router.post("/append", async (req, res) => {
    try {
      const chunksColl = await collection("knowledgeChunks");
      if (!chunksColl) return res.status(503).json({ error: "MongoDB is not configured." });
      const chunks = Array.isArray(req.body.chunks) ? req.body.chunks : [];
      const now = new Date().toISOString();
      let added = 0;
      let updated = 0;
      for (const chunk of chunks) {
        const doc = {
          title: String(chunk.title || "").trim(),
          source: String(chunk.source || "").trim(),
          topics: Array.isArray(chunk.topics) ? chunk.topics : [],
          text: String(chunk.text || "").trim(),
          driveUrl: String(chunk.driveUrl || "").trim(),
          tokens: [...new Set(tokenize(`${chunk.title} ${chunk.text}`))],
          ingestedAt: now
        };
        if (!doc.title || !doc.text) continue;
        const existing = await chunksColl.findOne({ title: doc.title });
        if (existing) { await chunksColl.updateOne({ _id: existing._id }, { $set: doc }); updated += 1; }
        else { await chunksColl.insertOne(doc); added += 1; }
      }
      res.json({ added, updated });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  router.get("/summary", async (_req, res) => {
    try {
      const chunksColl = await collection("knowledgeChunks");
      const imagesColl = await collection("knowledgeImages");
      if (!chunksColl) return res.status(503).json({ error: "MongoDB is not configured." });
      const [chunkCount, imageCount, sources] = await Promise.all([
        chunksColl.countDocuments(),
        imagesColl ? imagesColl.countDocuments() : 0,
        chunksColl.aggregate([{ $group: { _id: "$source", count: { $sum: 1 } } }]).toArray()
      ]);
      res.json({ chunks: chunkCount, images: imageCount, sources: Object.fromEntries(sources.map((s) => [s._id, s.count])) });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  router.get("/search", async (req, res) => {
    try {
      const result = await retrieve(collection, String(req.query.q || ""), 10, 6);
      res.json(result);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  router.post("/ask", async (req, res) => {
    try {
      const question = String(req.body.question || "").trim();
      // Notes + web TOGETHER is the default (Ori: "I don't want one or the other").
      const useWeb = req.body.useWeb === undefined ? true : Boolean(req.body.useWeb);
      if (!question) return res.status(400).json({ error: "question is required" });
      const { chunks, images } = await retrieve(collection, question, 6, 4);
      const context = chunks.map((chunk, index) =>
        `[${index + 1}] ${chunk.title} (${chunk.source})\n${chunk.text}`).join("\n\n---\n\n");
      const pricingBlock = await pricingContextFor(question);
      const prompt = [
        "You are the construction-knowledge assistant for We The People Construction, a Los Angeles general contractor. The user is the owner, on a jobsite, deciding what to do next.",
        "SOURCES, in order of authority: (1) the company NOTES below - their own scope-of-work docs and sales decks - cite as [1], [2]; (2) " + (useWeb ? "live web search for current Southern California code/permit/practice facts - mark those statements (web)" : "nothing else - notes only") + ". Web facts must never silently contradict the notes - flag any conflict.",
        "ANSWER STYLE: write like a seasoned GC briefing the owner - flowing short paragraphs, not choppy one-line fragments; use a numbered list ONLY for a real step-by-step sequence and never use markdown tables. When the job touches structure, always cover in order: engineer/plans if needed -> permit (name the SoCal authority, e.g. LADBS) -> temporary support/shoring or safety prep -> the work itself -> inspections -> patch/finish. Include rough SoCal costs when you know them, and say what is commonly missed. COMPLIANCE COVERAGE is a standing part of EVERY briefing about physical work - even a cost-only or single-trade question: every answer MUST include a short 'Permits & inspections:' line (or section) naming the permit authority (e.g. LADBS) and the specific inspections the job will hit (rough/final at minimum) - an answer without it is incomplete; and if the work will cut into, open, remove or patch ANY existing finish (drywall, plaster, stucco, roofing, flooring) - including when that is only implied, e.g. for access, shoring or patch-back - the answer MUST also include a 'Hazmat:' line immediately after the 'Permits & inspections:' line stating the asbestos/lead survey gate (survey before demo, required regardless of building age) - omitting it when finishes get opened is an incomplete answer.",
        "IF THE QUESTION COMPARES OPTIONS (e.g. pavers vs concrete): give one '## <Option>' section per option. Inside each section: what it is in a sentence, then the actual installation process as a short numbered sequence (demo/excavation, base prep, the install, finish/cure), then its installed SoCal price on its own line ALWAYS labeled with the option's name (e.g. 'Concrete: roughly $X-$Y per sqft installed'), then 'Pros:' and 'Cons:' as short bullets. Finish with a '## Verdict' section - 2-4 plain sentences on which one to pick and when. Never mix two options' prices in the same sentence.",
        "SPEED: run at most 2 web searches before writing - do not keep browsing.",
        "Quote costs/specs from the notes exactly as written. If neither notes nor web settle something, say so plainly.",
        "HARD RULES: never state a permit-fee dollar amount or a code section number as fact unless it appears verbatim in the NOTES below - say \"verify current fee schedule with <authority>\" instead. Whenever the job involves demolition or opening walls/ceilings/floors, carry forward the asbestos/lead hazmat gate (survey required regardless of building age). Never invent an inspection type that isn't in the notes or well-established SoCal practice.",
        ...(pricingBlock ? [PRICING_INSTRUCTION] : []),
        ...(pricingBlock ? ["", pricingBlock] : []),
        "", "NOTES:", context || "(no matching notes - answer from web research and say the notes have no coverage on this)", "", `QUESTION: ${question}`, "", "ANSWER:"
      ].join("\n");
      let answer = "";
      let engine = "claude-haiku";
      try {
        answer = await runClaudeCli(collection, prompt, undefined, undefined, "knowledge-ask");
      } catch {
        engine = "context-only";
        answer = "Claude CLI unavailable - here are the matching notes verbatim:\n\n" +
          chunks.map((chunk, index) => `[${index + 1}] ${chunk.title}\n${chunk.text}`).join("\n\n");
      }
      res.json({
        answer: enforcePricingLabels(answer, pricingBlock), engine,
        sources: chunks.map((chunk, index) => ({ ref: index + 1, title: chunk.title, source: chunk.source, driveUrl: chunk.driveUrl })),
        images
      });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // Illustration + redesign via Google's image models ("Nano Banana"), billing
  // enabled 2026-07-16. QUALITY-FIRST ladder: 3.1-flash-image is the default
  // (best quality/latency ~8s), with older flash models as fallbacks if a call
  // errors. ?quality=max prepends the Pro model (~15s, highest fidelity).
  const GEMINI_IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image", "gemini-3.1-flash-lite-image"];
  const GEMINI_IMAGE_MODEL_MAX = "gemini-3-pro-image-preview";
  function imageModelLadder(quality) {
    return String(quality) === "max" ? [GEMINI_IMAGE_MODEL_MAX, ...GEMINI_IMAGE_MODELS] : GEMINI_IMAGE_MODELS;
  }

  // The style library, served to the Design view (chips + prompt blocks).
  router.get("/styles", (_req, res) => {
    const lib = loadStyles();
    if (!lib) return res.status(404).json({ error: "design-styles.json not found" });
    res.json(lib);
  });
  router.post("/illustrate", async (req, res) => {
    try {
      const promptText = String(req.body.prompt || "").trim();
      if (!promptText) return res.status(400).json({ error: "prompt is required" });
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.json({ configured: false, message: "Add GEMINI_API_KEY to contractor/.env (free key at aistudio.google.com/apikey), restart, and diagrams will generate here." });
      }
      let lastError = "";
      for (const model of GEMINI_IMAGE_MODELS) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Clean instructional construction diagram, labeled, for a contractor briefing: ${promptText}` }] }]
            }),
            signal: AbortSignal.timeout(90000)
          });
          const data = await response.json();
          if (!response.ok) { lastError = (data.error && data.error.message) || `HTTP ${response.status}`; continue; }
          const part = (((data.candidates || [])[0] || {}).content || {}).parts?.find((p) => p.inlineData && p.inlineData.data);
          if (!part) { lastError = "model returned no image"; continue; }
          const dir = path.join(__dirname, "uploads", "knowledge-gen");
          fs.mkdirSync(dir, { recursive: true });
          const fileName = `gen-${Date.now().toString(36)}.png`;
          fs.writeFileSync(path.join(dir, fileName), Buffer.from(part.inlineData.data, "base64"));
          return res.json({ configured: true, model, imageUrl: `/uploads/knowledge-gen/${fileName}` });
        } catch (error) {
          lastError = error.message;
        }
      }
      res.status(502).json({ configured: true, error: `Image generation failed: ${lastError}` });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // Room redesign: photo -> Gemini image EDIT (structure-preserving: keep
  // layout/camera, change finishes). Gemini is the ONLY render backend (Ori,
  // 2026-07-16: billing enabled, drop third-party render APIs).
  //   ?prompt=  full render instruction from the Design view (preferred)
  //   ?style= / ?room=  legacy formula — style names resolve through the style
  //                     library so its signature elements reach the render
  //   ?n=1-4    variations, generated IN PARALLEL (one photo, n renders)
  //   ?quality=max  prepend the Pro image model (~15s) over the flash default (~8s)
  async function geminiEditOnce(key, models, mime, imageB64, prompt) {
    let lastError = "";
    for (const model of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inlineData: { mimeType: mime, data: imageB64 } },
              { text: prompt }
            ] }]
          }),
          signal: AbortSignal.timeout(120000)
        });
        const data = await response.json();
        if (!response.ok) { lastError = (data.error && data.error.message) || `HTTP ${response.status}`; continue; }
        const part = (((data.candidates || [])[0] || {}).content || {}).parts?.find((p) => p.inlineData && p.inlineData.data);
        if (!part) { lastError = "model returned no image"; continue; }
        return { model, buf: Buffer.from(part.inlineData.data, "base64") };
      } catch (error) {
        lastError = error.message;
      }
    }
    throw new Error(lastError || "no image model available");
  }

  router.post("/redesign", express.raw({ type: "image/*", limit: "15mb" }), async (req, res) => {
    try {
      if (!req.body || !req.body.length) return res.status(400).json({ error: "send the room photo as the request body (image/*)" });
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.json({ configured: false, backend: "bridge", message: "Add GEMINI_API_KEY to contractor/.env and restart to generate in-app." });
      }
      const room = String(req.query.room || "room").trim().slice(0, 60);
      // The Design view composes its own full render prompt from the chat
      // (via /design-brief) and passes it here as ?prompt=. The legacy
      // room/style formula resolves the style through the library first so a
      // bare style name still renders with its real signature elements.
      const custom = String(req.query.prompt || "").trim().slice(0, 2000);
      let redesignPrompt = custom;
      if (!redesignPrompt) {
        const styleQ = String(req.query.style || "modern light").trim().slice(0, 120);
        const lib = matchStyle(styleQ);
        const styleText = lib && lib.interiorPrompt ? lib.interiorPrompt : `a ${styleQ} style`;
        redesignPrompt =
          `Redesign this ${room} in ${styleText}. STRUCTURE-PRESERVING edit: keep the exact camera angle, room layout, window/door positions and perspective lines; ` +
          "change only finishes, cabinetry/fixture styles, colors, materials and lighting. Photorealistic, consistent shadows and lighting direction, professionally staged, decluttered.";
      }
      const mime = /png/.test(String(req.headers["content-type"])) ? "image/png" : "image/jpeg";
      const imageB64 = Buffer.from(req.body).toString("base64");
      const dir = path.join(__dirname, "uploads", "knowledge-gen");
      const models = imageModelLadder(req.query.quality);
      const n = Math.min(Math.max(parseInt(req.query.n, 10) || 1, 1), 4);

      // n parallel edits of the same photo — Gemini returns naturally varied
      // renders per call, so parallel calls ARE the variations (fluid UX: 4
      // variations cost one render's wall-clock, not four).
      const settled = await Promise.allSettled(
        Array.from({ length: n }, () => geminiEditOnce(key, models, mime, imageB64, redesignPrompt))
      );
      const wins = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
      if (!wins.length) {
        const reason = settled[0] && settled[0].reason ? settled[0].reason.message : "unknown";
        return res.json({ configured: true, backend: "bridge", quotaBlocked: true, prompt: redesignPrompt, error: `Image generation unavailable: ${reason}` });
      }
      fs.mkdirSync(dir, { recursive: true });
      const stamp = Date.now().toString(36);
      const saved = wins.map((w, i) => {
        const fileName = `redesign-${stamp}-${i}.png`;
        fs.writeFileSync(path.join(dir, fileName), w.buf);
        return `/uploads/knowledge-gen/${fileName}`;
      });
      res.json({ configured: true, backend: "gemini", model: wins[0].model, imageUrl: saved[0], images: saved, prompt: redesignPrompt });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // Photo question: Ori snaps a jobsite picture, the local claude CLI (agentic
  // -p mode can Read image files) describes what it sees and answers using the
  // notes corpus retrieved from the description terms.
  router.post("/ask-photo", express.raw({ type: "image/*", limit: "15mb" }), async (req, res) => {
    try {
      if (!req.body || !req.body.length) return res.status(400).json({ error: "send the image as the request body (image/*)" });
      const question = String(req.query.question || "What am I looking at and what do I need to know?").trim();
      const dir = path.join(__dirname, "uploads", "knowledge-questions");
      fs.mkdirSync(dir, { recursive: true });
      const ext = /png/.test(String(req.headers["content-type"])) ? "png" : "jpg";
      const filePath = path.join(dir, `q-${Date.now().toString(36)}.${ext}`);
      fs.writeFileSync(filePath, req.body);
      // Pass 1 (cheap, haiku): describe the photo as search keywords so retrieval
      // matches what's IN the picture, not just the often-generic question text
      // (a "redo this backyard" question has no pool/paver terms to match on).
      // On any failure this degrades to question-only retrieval, same as before.
      let sceneTerms = "";
      try {
        const raw = await runClaudeCli(collection, [
          `Use your Read tool to look at the image file at: ${filePath}`,
          "Then reply with ONLY one line: 8-15 lowercase search keywords, space-separated, no punctuation, naming the construction elements, materials, rooms/areas and trades visible in the photo (e.g. \"pool jacuzzi spa pavers patio hardscape landscaping coping retaining wall\").",
          "No sentences, no preamble, no explanation - just the keyword line."
        ].join("\n"), 90000, undefined, "knowledge-photo-scene");
        const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
        sceneTerms = (lines[lines.length - 1] || "").slice(0, 300);
      } catch { /* keyword pass is best-effort */ }
      const { chunks, images } = await retrieve(collection, `${question} ${sceneTerms}`.trim(), 4, 3);
      const context = chunks.map((chunk, index) => `[${index + 1}] ${chunk.title}\n${chunk.text}`).join("\n\n---\n\n");
      const pricingBlock = await pricingContextFor(question, sceneTerms);
      const prompt = [
        `First, use your Read tool to look at the image file at: ${filePath}`,
        "Describe what construction element/condition is shown, then answer the question as a practical ordered plan for a Los Angeles GC: engineer/plans if structural -> permit (name the SoCal authority) -> shoring/safety prep -> the work -> inspections -> patch/finish. Write in flowing short paragraphs (numbered lists only for real step sequences); never use markdown tables.",
        "THEN add a section titled 'QUOTING QUANTITIES (rough)': estimate the measurable quantities a GC needs at quoting stage from what's visible - e.g. linear feet of base/upper cabinets and countertop, sqft of backsplash (LF of counter x 1.5ft is the rule of thumb), sqft of flooring/tile, count of fixtures/appliances/windows. Scale off reference objects (door ~80\" tall, counter 36\" AFF, outlet ~12\" AFF, standard appliances) and STATE your assumptions. Rough is fine - these feed a quote with margin, not a cut list.",
        "HARD RULES: never state a permit-fee dollar amount or a code section number as fact unless it appears verbatim in the NOTES below - say \"verify current fee schedule with <authority>\" instead. If the photo shows or the question involves demolition or opening walls/ceilings/floors, always include the asbestos/lead hazmat gate (survey required regardless of building age). Never invent an inspection type that isn't in the notes or well-established SoCal practice.",
        "Use the company NOTES below as the primary reference where relevant (cite [1], [2]); supplement with web search for current SoCal code/permit facts and mark those statements (web).",
        ...(pricingBlock ? [PRICING_INSTRUCTION] : []),
        ...(pricingBlock ? ["", pricingBlock] : []),
        "", "NOTES:", context || "(none matched - answer from the image + web research)",
        "", `QUESTION: ${question}`, "", "ANSWER:"
      ].join("\n");
      // Sonnet for photo questions: haiku misreads scenes (e.g. called a printed
      // brochure a real kitchen); scene identification is the whole feature here.
      let answer = "";
      let engine = "claude-sonnet";
      try {
        answer = await runClaudeCli(collection, prompt, 240000, "claude-sonnet-5", "knowledge-photo");
      } catch (error) {
        engine = "error";
        answer = `Could not analyze the photo: ${error.message}`;
      }
      res.json({ answer: enforcePricingLabels(answer, pricingBlock), engine, photoUrl: `/uploads/knowledge-questions/${path.basename(filePath)}`,
        sources: chunks.map((chunk, index) => ({ ref: index + 1, title: chunk.title, source: chunk.source, driveUrl: chunk.driveUrl })),
        images });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // Design-brief conversation (Design view). The customer photographs a real
  // room and types plain-speech requests; each message posts the whole thread
  // here. Haiku maintains a structured brief and composes ONE structure-
  // preserving image-edit instruction (renderPrompt) that the Design view then
  // sends to /redesign (?prompt=) or hands to Gemini. Always returns valid JSON;
  // if the CLI fails or emits non-JSON, we compose a fallback from the raw
  // messages using the same proven formula so the flow never dead-ends.
  const RENDER_TAIL = "Photorealistic, consistent shadows and lighting direction, magazine-quality interior photography, professionally staged, decluttered.";
  // Mode-dependent preservation clause (axis (e) of the 5-axis scaffold).
  // Redecorate = keep everything structural, restyle only. Remodel = may
  // reconfigure cabinetry/layout/built-ins, but camera + room envelope + the
  // window/door openings are always held.
  // Round-1 realism review hardening (2026-07-14): remodel mode silently widened
  // a galley kitchen ~5ft and rebuilt the window — the guardrails below are the
  // fix. Both modes: REPLACE fixtures rather than adding competing ones (the
  // review caught a surviving chrome faucet + a second ceiling light).
  const PRESERVE_REDECORATE = "STRUCTURE-PRESERVING edit: keep the exact camera angle and room envelope — the walls, windows, doors, ceiling and built-in cabinetry stay in their current positions and perspective lines, and the view through every window stays exactly as it is; change only finishes, colors, furniture, decor, textiles and lighting fixtures. When a finish or fixture is changed it REPLACES the old one — never leave the old faucet, light fixture, or hardware alongside the new; remove wall-mounted accessories that no longer belong. Plumbing fixtures keep their existing mounting type (floor-mounted stays floor-mounted, wall-hung stays wall-hung) unless the customer explicitly asked to change it, and frosted or privacy glass stays frosted — never invent a new view through any glass";
  // Exterior clause — hardened 2026-07-16 after a Spanish Revival test: the pro
  // image model zoomed in, cropped the street context, and invented a projecting
  // arched entry volume. Naming the framing elements (street, sidewalk, driveway,
  // fence, neighbors) and banning new building volumes fixed it exactly.
  const PRESERVE_EXTERIOR = "STRUCTURE-PRESERVING edit of a house exterior: this is the SAME photograph re-finished — keep the EXACT camera position, distance and framing including the street, sidewalk, driveway, fences and neighboring context visible in the photo (do NOT zoom in, crop, or move closer); keep the house footprint, massing and rooflines EXACTLY as they are — do NOT add, enlarge or project any entry, tower, porch or addition volume; the front door and every window stay in their exact positions and sizes; change ONLY surface finishes, colors, trim profiles, light fixtures, hardscape surfaces and planting";
  const PRESERVE_REMODEL = "REMODEL edit: keep the exact camera angle and the room's true footprint — do NOT widen the room, raise the ceiling, or move, resize, or re-trim any window or exterior door, and keep the exact view through the glass; the new layout must fit the existing footprint with realistic 36-42 inch walkway clearances (if an island cannot fit, use a peninsula or skip it), counters with seating need proper overhang for knee space; within those limits you MAY reconfigure cabinetry, layout, built-ins and fixtures. Replaced fixtures REPLACE the old ones — never both. Plumbing fixtures keep their existing mounting type (floor-mounted stays floor-mounted, wall-hung stays wall-hung) unless the customer explicitly asked to change it, and frosted or privacy glass stays frosted — never invent a new view through any glass";
  function preserveClause(mode) {
    return String(mode) === "remodel" ? PRESERVE_REMODEL : PRESERVE_REDECORATE;
  }
  function composeRenderPrompt(mode, room, changes, keep) {
    const changeText = (Array.isArray(changes) && changes.length) ? changes.join(", ") : "the requested finishes and styling";
    const keepText = (Array.isArray(keep) && keep.length) ? " Also keep " + keep.join(", ") + "." : "";
    return `Redesign this ${room || "space"}. ${preserveClause(mode)}.${keepText} Apply: ${changeText}. ${RENDER_TAIL}`;
  }
  function extractJson(text) {
    if (!text) return null;
    let t = String(text).trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end < 0 || end < start) return null;
    try { return JSON.parse(t.slice(start, end + 1)); } catch (_e) { return null; }
  }

  router.post("/design-brief", async (req, res) => {
    try {
      const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
      if (!messages.length) return res.status(400).json({ error: "messages is required" });
      const mode = String(req.body.mode || "redecorate").toLowerCase() === "remodel" ? "remodel" : "redecorate";
      const userTexts = messages
        .filter((m) => m && String(m.role) !== "assistant")
        .map((m) => String((m && m.text) || "").trim())
        .filter(Boolean);
      // Exterior subjects get their own hardened clause (framing + massing bans)
      // regardless of mode — inferred from the customer's own words, same as room type.
      const isExterior = /\b(exterior|facade|curb appeal|front of (the )?house|front yard|backyard|back yard|yard|landscap|driveway|stucco|siding|roof|porch|patio|hardscape|garden|fence)\b/i
        .test(userTexts.join(" "));
      const preserve = isExterior ? PRESERVE_EXTERIOR : preserveClause(mode);
      const transcript = messages
        .map((m) => (String(m && m.role) === "assistant" ? "Designer: " : "Customer: ") + String((m && m.text) || "").trim())
        .join("\n");
      // Cross-connectivity: the same style library that powers the Q&A corpus
      // grounds the render brief. If the customer named a known style, hand the
      // composer its REAL card — signature elements, materials, lighting, mood —
      // so axis (a)/(b)/(c)/(d) come from the library, not the model's memory.
      const matched = matchStyle(userTexts.join(" "));
      // Advice questions ("what styles would suit this?") deserve real picks from
      // the library, not a silently composed render clause built from the question.
      const lastUserText = userTexts.length ? userTexts[userTexts.length - 1] : "";
      const isAdviceQuestion = /\b(suggest|recommend|which|what)\b[^.?!]*\bstyles?\b/i.test(lastUserText);
      const styleMenu = (() => {
        const lib = loadStyles();
        if (!lib || !Array.isArray(lib.styles)) return "";
        return lib.styles.map((s) => s.name).filter(Boolean).join(", ");
      })();
      const styleCard = matched ? [
        `STYLE LIBRARY CARD for "${matched.name}" (use THIS as the ground truth for the style axes — pick the most render-distinctive elements, don't dump the whole card):`,
        `  signature: ${(matched.signature || []).join("; ")}`,
        `  materials: ${(matched.materials || []).map((m) => m.item).join("; ")}`,
        `  palette: ${(matched.palette || []).join("; ")}`,
        `  lighting: ${matched.lighting || ""}`,
        `  furniture: ${matched.furniture || ""}`,
        `  mood: ${(matched.mood || []).join(", ")}`,
        `  avoid (never render these): ${(matched.avoid || []).join("; ")}`,
        `  prompt block to build from: ${(isExterior ? matched.exteriorPrompt : matched.interiorPrompt) || matched.interiorPrompt || ""}`
      ].join("\n") : "";
      const prompt = [
        "You are the design-brief assistant inside a Los Angeles remodeling contractor's photo-redesign tool. The customer has uploaded a PHOTO of a real room and is telling you in plain speech what they want. You maintain a running structured design brief across the whole conversation and compose ONE image-edit instruction that a photorealistic, STRUCTURE-PRESERVING image model will run on their photo.",
        "READ THE ENTIRE CONVERSATION and merge every request into one coherent brief. Later messages refine or override earlier ones.",
        "Ask AT MOST ONE short clarifying question, and ONLY when something essential is missing or two requests conflict (e.g. you genuinely cannot tell what room it is). Otherwise DO NOT ask a question — warmly confirm and proceed. Never make them pick from a menu.",
        "You CANNOT see the photo. Infer the room type ONLY from the customer's own words (\"cabinets and counters\" implies kitchen; \"vanity and shower\" implies bathroom). If their words don't identify the room, use the neutral word \"space\" in renderPrompt and let your one clarifying question ask which room it is — never guess (the photo may be an exterior, a yard, or any room).",
        "This session's MODE is \"" + mode + "\". The camera/structure clause you MUST copy VERBATIM into renderPrompt is: \"" + preserve + "\".",
        isExterior ? "EXTERIOR RULE: when picking style elements, use ONLY surface-level cues (stucco/siding finish, trim, colors, fixtures, hardscape surfaces, planting) — NEVER cues that change building massing (arched entry surrounds, towers, porticos, added porches) unless the customer explicitly asked for that construction." : "",
        styleCard,
        "Compose renderPrompt on FIVE explicit axes, woven into ONE flowing instruction (not a bulleted list):",
        "  (a) STYLE — name the style the customer implies, and cite 2-3 signature elements of that named style" + (styleCard ? " taken from the STYLE LIBRARY CARD above" : " (e.g. Japandi -> low-profile wood furniture, muted earth tones, paper-shade lighting; Modern Farmhouse -> shaker cabinetry, apron sink, black-metal accents)") + ".",
        "  (b) LIGHTING — natural light quality, fixtures, and time-of-day warmth (e.g. bright airy daylight; warm layered evening glow).",
        "  (c) MATERIALS — specific named materials/finishes for the surfaces being changed (e.g. white oak, honed quartz, matte-black hardware) — never the phrase 'nice materials'.",
        "  (d) MOOD — 2-3 adjectives (e.g. serene, warm, sophisticated).",
        "  (e) CAMERA/STRUCTURE — the VERBATIM clause above, then end with: \"" + RENDER_TAIL + "\".",
        "EVERY specific change the customer asked for MUST appear in renderPrompt using their own key nouns — if they said \"walk-in shower\", \"island\", or \"farmhouse sink\", those exact words appear in the instruction (a lost request is the worst failure this tool can make). Weave them into the materials/changes sentence.",
        "renderPrompt template (fill the blanks): \"Redesign this <room> in <named style> (<2-3 signature elements>). <the customer's specific requested changes, their own nouns kept>. <lighting sentence>. <materials sentence>. Mood: <adjectives>. " + preserve + ". " + RENDER_TAIL + "\"",
        "reply is 1-2 warm, conversational sentences to the customer, like texting — never JSON, never a bulleted list.",
        isAdviceQuestion && styleMenu ? "EXCEPTION — the customer's LATEST message is asking for style suggestions, so ANSWER IT in reply: pick the 3 best-fitting styles for what they've described, by exact NAME from this library only: " + styleMenu + ". One short line on why each fits (reply may run 3-4 sentences for this). Do NOT fold their question into renderPrompt and do NOT assert a chosen style yet — keep renderPrompt as the brief composed from their actual change requests so far (style-neutral if none named)." : "",
        "Return ONLY a single minified JSON object, no markdown fences, no text before or after it:",
        '{"reply":"...","brief":{"room":"...","style":"...","changes":["..."],"keep":["..."]},"renderPrompt":"..."}',
        "",
        "CONVERSATION (most recent last):",
        transcript,
        "",
        "JSON:"
      ].join("\n");

      let raw = "";
      try {
        raw = await runClaudeCli(collection, prompt, 90000, "claude-haiku-4-5-20251001", "design-brief");
      } catch (_e) { raw = ""; }
      const parsed = extractJson(raw);
      if (parsed && parsed.renderPrompt) {
        const brief = parsed.brief && typeof parsed.brief === "object" ? parsed.brief : {};
        return res.json({
          reply: String(parsed.reply || "").trim() || "Got it — your render brief is updated below.",
          mode,
          brief: {
            room: String(brief.room || "").trim(),
            style: String(brief.style || "").trim(),
            changes: Array.isArray(brief.changes) ? brief.changes.map((c) => String(c || "").trim()).filter(Boolean) : [],
            keep: Array.isArray(brief.keep) ? brief.keep.map((c) => String(c || "").trim()).filter(Boolean) : []
          },
          // Advice-question turns must still return a runnable instruction — the
          // model sometimes emits a placeholder ("awaiting style selection") that
          // would go straight to the image model if the user hits Generate.
          renderPrompt: (isAdviceQuestion && !String(parsed.renderPrompt).includes(RENDER_TAIL.slice(0, 24))
            ? composeRenderPrompt(mode, String(brief.room || "").trim() || "space",
                Array.isArray(brief.changes) && brief.changes.length ? brief.changes : userTexts.slice(0, -1),
                Array.isArray(brief.keep) ? brief.keep : [])
            : String(parsed.renderPrompt).trim()).slice(0, 2000),
          engine: "claude-haiku"
        });
      }
      // Fallback: compose from the raw customer messages with the mode-correct clause.
      return res.json({
        reply: "Here's your render brief — tweak it below or tell me another change.",
        mode,
        brief: { room: "", style: "", changes: userTexts, keep: [] },
        renderPrompt: composeRenderPrompt(mode, "space", userTexts, []),
        engine: "fallback"
      });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  return router;
};
