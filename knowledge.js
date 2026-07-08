// Construction Notes knowledge base — RAG over Ori's Drive folder (whiteboards,
// client decks, scope-of-work PDF). Chunks live in Mongo (knowledgeChunks),
// images reference Google Drive thumbnails (render for the logged-in owner).
// Retrieval is lexical (term overlap + title/topic boost) — the corpus is small
// and domain terms are distinctive, so no embedding infra is needed.
// Answering spawns the local claude CLI (haiku) like research-chat; if the CLI
// fails, the endpoint degrades to returning the retrieved context directly.
const express = require("express");
const { spawn } = require("child_process");

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
      if (!question) return res.status(400).json({ error: "question is required" });
      const { chunks, images } = await retrieve(collection, question, 6, 4);
      if (!chunks.length) {
        return res.json({
          answer: "Nothing in the Construction Notes matches that topic. The knowledge base covers the product scopes (roofing, bathroom, kitchen, electrical, foundation, paint, etc.), the client decks, and the trade whiteboards.",
          engine: "no-context", sources: [], images: []
        });
      }
      const context = chunks.map((chunk, index) =>
        `[${index + 1}] ${chunk.title} (${chunk.source})\n${chunk.text}`).join("\n\n---\n\n");
      const prompt = [
        "You are the construction-knowledge assistant for We The People Construction (LA general contractor).",
        "Answer the question using ONLY the notes below - they are the company's own scope-of-work documents and sales decks.",
        "Be concrete and step-by-step where the notes are. Quote costs/specs exactly as written. If the notes only partially cover the question, say what is missing.",
        "Cite sources inline as [1], [2] matching the numbered notes.",
        "", "NOTES:", context, "", `QUESTION: ${question}`, "", "ANSWER:"
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

  return router;
};
