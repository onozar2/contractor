// Bids — clean Word-style PROPOSAL documents, not contracts.
//
// Ori's spec: bid-template.html was "too complicated... all these buttons...
// not supposed to be the contract yet." This module gives the app view
// (app_bids.js) two things:
//
//   1. POST /api/bids/draft-scope — retrieval-first scope assembly. Given a
//      rough plain-English job description, it pulls the company's own
//      "back pocket" step-by-step lines out of the knowledge base — the
//      Scope of Work PDF (the Platinum step-by-step lines) first, then the
//      SoCal job playbooks — and asks Claude to organize THOSE lines,
//      near-verbatim, into a trade-by-trade scope for this specific job.
//      It never invents ungrounded steps, and it never dies: if the CLI is
//      unavailable it degrades to the raw retrieved sections, grouped.
//
//   2. CRUD for saved proposals (Mongo collection "proposals"), merge-safe
//      PUT per the app's established partial-PUT pattern (see permits.js).
//
// Router factory mirrors permits.js / suppliers.js: `collection` is the app
// helper `async (name) => coll|null`; every route 503s when Mongo isn't
// configured; :id routes look up by ObjectId.
const express = require("express");
const { ObjectId } = require("mongodb");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { parseCliJson, logTokenUsage } = require("./tokenlog");

// Sources ingested by tmp/ingest-knowledge.mjs (confirmed live via
// /api/knowledge/summary 2026-07-14): "Scope of Work PDF" (32 chunks — the
// Platinum step-by-step lines) and "SoCal job playbooks" (55 chunks). These
// are the "back pocket" lines Ori wants reused near-verbatim; everything
// else in the corpus (client decks, trends, bid comparables) is useful
// grounding but not the authoritative scope language.
//
// 2026-07-14 tuning note: boost used to be {1000, 500} — a gap so wide that
// ANY Platinum chunk matching even one loosely-related term (e.g. "code" or
// "shower" from an unrelated bathroom chunk) always outranked a SoCal job
// playbook chunk that was a much stronger topical match (e.g. the actual
// "Playbook: Whole-House Repipe" for a repipe job). That silently dropped
// playbook-only lines from context — permit callouts, pressure-test/ridge/
// control-joint/asbestos steps that live in the playbooks' fuller job arc
// but aren't repeated in the shorter Platinum trade chunk. Confirmed via
// /api/knowledge/search that those lines exist in the corpus and simply
// weren't making it into the retrieved set. Shrunk the gap so real term
// relevance (which can swing 10-60+ points on a specific query) decides
// ranking, and source type only breaks near-ties in Platinum's favor.
const SOURCE_BOOST = { "Scope of Work PDF": 25, "SoCal job playbooks": 15 };

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "what", "which", "where", "when",
  "how", "does", "do", "is", "are", "was", "were", "will", "would", "should",
  "could", "can", "a", "an", "of", "to", "in", "on", "at", "it", "my", "our",
  "your", "you", "we", "they", "need", "needs", "about", "into", "from", "new"
]);

function tokenize(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

// Same lexical scoring as knowledge.js's retrieve() — reused here rather than
// imported since knowledge.js only exports its router factory, not its
// internal helpers.
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

// Retrieval-first: rank every chunk by term overlap (must be > 0 — no blind
// dumping of the whole corpus), then break ties/reorder so Scope of Work PDF
// and SoCal job playbook chunks — the company's own tested lines — always
// float to the top of what gets fed to the model.
async function retrieveBidContext(collection, queryText, limit = 16) {
  const chunksColl = await collection("knowledgeChunks");
  if (!chunksColl) return [];
  const terms = tokenize(queryText);
  const all = await chunksColl.find({}).toArray();
  const ranked = all
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      const boostedB = b.score + (SOURCE_BOOST[b.chunk.source] || 0);
      const boostedA = a.score + (SOURCE_BOOST[a.chunk.source] || 0);
      return boostedB - boostedA;
    })
    .slice(0, limit);
  return ranked.map(({ chunk, score }) => ({
    id: chunk._id.toString(), title: chunk.title, source: chunk.source, text: chunk.text, score
  }));
}

// Local `claude` CLI spawn — same shape as knowledge.js's runClaudeCli
// (collection first, since this file lives outside server.js's closure).
function runClaudeCli(collection, prompt, timeoutMs = 180000, model = "claude-sonnet-5", feature = "bid-scope") {
  return new Promise((resolve, reject) => {
    const started = Date.now();
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

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// Defensive JSON parsing: strip markdown fences the model might add despite
// instructions, then grab the outermost {...} block, then parse. Returns
// null (never throws) so the caller can fall back to the raw-chunks degrade.
function parseScopeJson(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.sections)) {
      const sections = parsed.sections
        .map((s) => ({
          trade: cleanString(s && s.trade) || "Scope",
          lines: Array.isArray(s && s.lines) ? s.lines.map(cleanString).filter(Boolean) : []
        }))
        .filter((s) => s.lines.length);
      if (!sections.length) return null;
      return {
        sections,
        notes: Array.isArray(parsed.notes) ? parsed.notes.map(cleanString).filter(Boolean) : []
      };
    }
  } catch (_error) {
    // not valid JSON even after cleanup — caller degrades to raw chunks
  }
  return null;
}

// Feature never dies: if the CLI is unavailable or returns unparsable
// output, hand back the retrieved source chunks themselves, grouped as
// one section per chunk (numbered lines split out of the chunk text) so
// the estimator still gets real, sourced content to start from.
function fallbackSections(chunks) {
  const sections = chunks
    .map((chunk) => ({
      trade: cleanString(chunk.title)
        .replace(/\s*—\s*scope of work$/i, "")
        .replace(/^Playbook:\s*/i, ""),
      lines: String(chunk.text || "")
        .split("\n")
        .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
        .filter((line) => line && !/^#/.test(line) && line.length > 3)
    }))
    .filter((s) => s.lines.length);
  return {
    sections,
    notes: chunks.length
      ? ["Drafting assistant was unavailable — these sections are the raw retrieved knowledge-base lines. Review and tighten before sending."]
      : ["No matching knowledge-base sections were found for this description — write the scope manually."]
  };
}

function buildScopePrompt(projectTitle, description, chunks) {
  const context = chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.title} (${chunk.source})\n${chunk.text}`)
    .join("\n\n---\n\n");
  return [
    "You are drafting the SCOPE OF WORK section of a client-facing proposal for Joon Development Group, a Los Angeles general contractor. This is a PROPOSAL, not a contract — no payment terms, no legalese, scope lines only.",
    `PROJECT: ${projectTitle || "(untitled)"}`,
    `CLIENT'S DESCRIPTION OF THE JOB, IN PLAIN WORDS: ${description}`,
    "",
    "SOURCE MATERIAL — retrieved from the company's own knowledge base. These are the company's own tested, step-by-step scope lines (a scope-of-work PDF used on real jobs, and SoCal job playbooks). Treat this as your source of truth, listed in priority order:",
    context || "(no matching source material found — use standard California residential construction practice only, and say so in notes)",
    "",
    "TASK: Assemble a trade-by-trade scope of work for THIS specific job.",
    "1. Group the work into trade sections in realistic construction sequence — the same way the company's own signed proposals are organized (e.g. Demo, Framing, Plumbing, Electrical, Waterproofing / Hot Mop, Tile, Drywall & Paint, Cabinetry / Vanity, Clean Up — use only the sections that actually apply to this job).",
    "2. For each line: reuse the wording of the SOURCE MATERIAL above near-verbatim wherever it applies — these are proven lines, not a place to be creative. Adapt quantities, fixture counts, and specifics to match the client's description.",
    "3. Drop source lines that clearly do not apply to this job (e.g. skip a walk-in-tub install line if the client is removing a tub for a shower).",
    "4. Do NOT invent steps that are not grounded in the source material above or in standard California residential construction practice. Do NOT include payment schedules, deposits, signature blocks, warranty language, or any contract legalese.",
    "5. PERMIT — every one of the company's own scope templates above opens (or nearly opens) with a permit line; this job needs one too even if the specific chunk you're leaning on most doesn't happen to repeat it. Put it near the top of the first section. Phrase it with the singular word \"permit\" (e.g. \"Pull city permit\", \"Pull plumbing permit\", \"Permit / plan-check\") — several source chunks say \"permits\" (plural) but match this job's own template phrasing style, singular reads cleaner and is the more common form across the source material.",
    "6. CLEAN UP — every one of the company's own scope templates ends the job with a clean-up/haul-away line (\"Clean up and haul away debris\", \"Clean entire job site\", \"Haul away trash\") even when the one trade chunk you're leaning on most for this job doesn't spell it out itself. Always close the LAST section of the scope with one, in the source material's own wording.",
    "7. PAINT — whenever a line in your scope calls for painting (interior, exterior, trim, ceiling, patched drywall, baseboards), state it as priming plus 2 coats of paint (e.g. \"Apply primer and 2 coats of paint\") — that's the standard spec behind every \"apply prime and paint\" line in the source material, make it explicit rather than leaving the coat count implied.",
    "8. PROPORTION — keep each trade's level of detail in proportion to the source material for that trade, not maximally granular. For jobs that repeat the same trade across more than one room or area (e.g. a kitchenette AND a bathroom in one ADU), write the shared trade work (framing, rough plumbing, rough electrical, drywall, paint, inspections) as ONE consolidated set of lines covering all the affected rooms together, and only split out room-specific lines where the fixtures/finishes actually differ (e.g. kitchenette cabinets vs. bathroom vanity). Do not restate a full per-fixture line list twice for two similar wet rooms — that pads length without adding real scope.",
    "",
    "Return STRICT JSON only — no markdown fences, no commentary before or after — in exactly this shape:",
    '{"sections":[{"trade":"Framing","lines":["line 1","line 2"]}],"notes":["short note"]}',
    "\"notes\" is optional: use it only for something the estimator should double-check (e.g. an assumption made because the description didn't specify something). Keep each line concise and one action per line, matching the style of the source material.",
    "",
    "JSON:"
  ].join("\n");
}

module.exports = function createBidsRouter(collection) {
  const router = express.Router();
  router.use(express.json({ limit: "2mb" }));

  async function proposals() {
    return collection("proposals");
  }

  function shape(row) {
    return { ...row, id: row._id.toString(), _id: undefined };
  }

  function normalizeSection(input) {
    return {
      trade: cleanString(input && input.trade),
      lines: Array.isArray(input && input.lines) ? input.lines.map(cleanString).filter(Boolean) : []
    };
  }

  function normalizeProposal(input) {
    input = input || {};
    return {
      title: cleanString(input.title),
      clientName: cleanString(input.clientName),
      address: cleanString(input.address),
      date: cleanString(input.date) || new Date().toISOString().slice(0, 10),
      totalPrice: cleanString(input.totalPrice),
      sections: Array.isArray(input.sections) ? input.sections.map(normalizeSection).filter((s) => s.trade || s.lines.length) : [],
      bioIncluded: input.bioIncluded !== false,
      html: typeof input.html === "string" ? input.html : ""
    };
  }

  // Company + proposal boilerplate for the document (letterhead, bio,
  // placeholder reviews, general provisions). Lives on disk, not Mongo — the
  // same "brand pack" pattern as brands/joon/brand.json used by the public
  // site, just a sibling file scoped to bids.
  router.get("/brand", (_req, res) => {
    try {
      const brand = JSON.parse(fs.readFileSync(path.join(__dirname, "brands", "joon", "brand.json"), "utf8"));
      const proposal = JSON.parse(fs.readFileSync(path.join(__dirname, "brands", "joon", "proposal.json"), "utf8"));
      res.json({
        companyName: brand.companyName,
        licenseText: brand.licenseText,
        phone: brand.phone,
        email: brand.email,
        serviceArea: brand.serviceArea,
        bio: proposal.bio,
        reviews: proposal.reviews,
        provisions: proposal.provisions
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Retrieval-first scope assembly. Never 502s on a CLI failure — degrades
  // to raw retrieved sections so the feature always returns something usable.
  router.post("/draft-scope", async (req, res) => {
    try {
      const projectTitle = cleanString(req.body.projectTitle);
      const description = cleanString(req.body.description);
      if (!description) return res.status(400).json({ error: "description is required" });

      const chunks = await retrieveBidContext(collection, `${projectTitle} ${description}`.trim(), 16);
      let result = null;
      let engine = "claude-sonnet";
      try {
        const raw = await runClaudeCli(collection, buildScopePrompt(projectTitle, description, chunks), 180000, "claude-sonnet-5", "bid-scope");
        result = parseScopeJson(raw);
        if (!result) engine = "context-only";
      } catch (_error) {
        engine = "context-only";
      }
      if (!result) result = fallbackSections(chunks);

      res.json({
        sections: result.sections,
        notes: result.notes || [],
        engine,
        groundedOn: chunks.map((c) => ({ title: c.title, source: c.source }))
      });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  router.get("/", async (_req, res) => {
    const coll = await proposals();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const rows = await coll.find({}).sort({ updatedAt: -1 }).toArray();
    res.json(rows.map(shape));
  });

  router.post("/", async (req, res) => {
    const coll = await proposals();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const now = new Date().toISOString();
    const doc = { ...normalizeProposal(req.body), createdAt: now, updatedAt: now };
    const result = await coll.insertOne(doc);
    res.status(201).json({ ...doc, id: result.insertedId.toString() });
  });

  router.get("/:id", async (req, res) => {
    const coll = await proposals();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    let objectId;
    try { objectId = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid proposal id." }); }
    const row = await coll.findOne({ _id: objectId });
    if (!row) return res.status(404).json({ error: "Proposal not found." });
    res.json(shape(row));
  });

  // Merge-safe PUT: spread existing before normalize, so a partial PUT (e.g.
  // just an inline total-price edit) can't blank unmentioned fields — same
  // known-bug-pattern fix as permits.js.
  router.put("/:id", async (req, res) => {
    const coll = await proposals();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    let objectId;
    try { objectId = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid proposal id." }); }
    const existing = await coll.findOne({ _id: objectId });
    if (!existing) return res.status(404).json({ error: "Proposal not found." });
    const update = { ...normalizeProposal({ ...existing, ...req.body }), createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    await coll.updateOne({ _id: objectId }, { $set: update });
    res.json({ ...update, id: req.params.id });
  });

  router.delete("/:id", async (req, res) => {
    const coll = await proposals();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    let objectId;
    try { objectId = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid proposal id." }); }
    await coll.deleteOne({ _id: objectId });
    res.status(204).end();
  });

  return router;
};

// MOUNT: crmApp.use("/api/bids", require("./bids")(collection));
