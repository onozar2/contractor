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

function runClaudeCli(prompt, timeoutMs = 150000) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--model", "claude-haiku-4-5-20251001", "--output-format", "text"], {
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
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(err.trim() || `Claude CLI exited ${code}`));
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
      const prompt = [
        "You are the construction-knowledge assistant for We The People Construction, a Los Angeles general contractor. The user is the owner, on a jobsite, deciding what to do next.",
        "SOURCES, in order of authority: (1) the company NOTES below - their own scope-of-work docs and sales decks - cite as [1], [2]; (2) " + (useWeb ? "live web search for current Southern California code/permit/practice facts - mark those statements (web)" : "nothing else - notes only") + ". Web facts must never silently contradict the notes - flag any conflict.",
        "ANSWER STYLE: a practical, ordered sequence of steps the way a seasoned GC would brief a foreman. When the job touches structure, always cover in order: engineer/plans if needed -> permit (name the SoCal authority, e.g. LADBS) -> temporary support/shoring or safety prep -> the work itself -> inspections -> patch/finish. Include rough SoCal costs when you know them, and say what is commonly missed.",
        "Quote costs/specs from the notes exactly as written. If neither notes nor web settle something, say so plainly.",
        "", "NOTES:", context || "(no matching notes - answer from web research and say the notes have no coverage on this)", "", `QUESTION: ${question}`, "", "ANSWER:"
      ].join("\n");
      let answer = "";
      let engine = "claude-haiku";
      try {
        answer = await runClaudeCli(prompt);
      } catch {
        engine = "context-only";
        answer = "Claude CLI unavailable - here are the matching notes verbatim:\n\n" +
          chunks.map((chunk, index) => `[${index + 1}] ${chunk.title}\n${chunk.text}`).join("\n\n");
      }
      res.json({
        answer, engine,
        sources: chunks.map((chunk, index) => ({ ref: index + 1, title: chunk.title, source: chunk.source, driveUrl: chunk.driveUrl })),
        images
      });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  // Illustration via Google's image models ("Nano Banana"). Needs GEMINI_API_KEY
  // in .env (free at aistudio.google.com/apikey). Tries the Pro image model
  // first, falls back to the flash image model if unavailable on the key's tier.
  const GEMINI_IMAGE_MODELS = ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"];
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
      const { chunks, images } = await retrieve(collection, question, 4, 3);
      const context = chunks.map((chunk, index) => `[${index + 1}] ${chunk.title}\n${chunk.text}`).join("\n\n---\n\n");
      const prompt = [
        `First, use your Read tool to look at the image file at: ${filePath}`,
        "Describe what construction element/condition is shown, then answer the question as a practical ordered plan for a Los Angeles GC: engineer/plans if structural -> permit (name the SoCal authority) -> shoring/safety prep -> the work -> inspections -> patch/finish.",
        "Use the company NOTES below as the primary reference where relevant (cite [1], [2]); supplement with web search for current SoCal code/permit facts and mark those statements (web).",
        "", "NOTES:", context || "(none matched - answer from the image + web research)",
        "", `QUESTION: ${question}`, "", "ANSWER:"
      ].join("\n");
      let answer = "";
      let engine = "claude-haiku";
      try {
        answer = await runClaudeCli(prompt, 240000);
      } catch (error) {
        engine = "error";
        answer = `Could not analyze the photo: ${error.message}`;
      }
      res.json({ answer, engine, photoUrl: `/uploads/knowledge-questions/${path.basename(filePath)}`,
        sources: chunks.map((chunk, index) => ({ ref: index + 1, title: chunk.title, source: chunk.source, driveUrl: chunk.driveUrl })),
        images });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  return router;
};
