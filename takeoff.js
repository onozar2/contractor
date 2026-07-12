const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { ObjectId } = require("mongodb");

// Plan Takeoff module ("Bluebeam-lite") for the Joon subcontractor-finder CRM.
// Factory mirrors suppliers.js / photofeed.js:
// - `collection` is the app helper `async (name) => coll|null`.
// - every route returns 503 when Mongo is not configured.
// - :id routes look up documents by ObjectId.
//
// Plans live on disk under UPLOADS_DIR (same tree photofeed/actuals photos use)
// and are served statically at /uploads by server.js (already mounted there —
// this module does not mount its own static route).

const UPLOADS_DIR = path.join(__dirname, "uploads");
const COSTBOOK_PATH = path.join(__dirname, "costbook.json");
const ITEM_KINDS = ["line", "area", "count"];
const ITEM_UNITS = ["lf", "sqft", "ea"];

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pickEnum(value, allowed, fallback) {
  const raw = cleanString(value);
  return allowed.includes(raw) ? raw : fallback;
}

function genId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function cleanIsoDate(value, fallback) {
  const raw = cleanString(value);
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function cleanPoints(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((pt) => Array.isArray(pt) && pt.length >= 2)
    .map((pt) => [Number(pt[0]) || 0, Number(pt[1]) || 0]);
}

function normalizeScale(value) {
  if (!value || typeof value !== "object") return null;
  const pixels = Number(value.pixels || 0);
  const realFeet = Number(value.realFeet != null ? value.realFeet : value.feet || 0);
  if (!pixels || !realFeet) return null;
  return { pixels, realFeet };
}

function normalizeItem(input) {
  const raw = input && typeof input === "object" ? input : {};
  return {
    id: cleanString(raw.id) || genId(),
    kind: pickEnum(raw.kind, ITEM_KINDS, "line"),
    label: cleanString(raw.label),
    points: cleanPoints(raw.points),
    value: Number(raw.value || 0),
    unit: pickEnum(raw.unit, ITEM_UNITS, "lf"),
    costbookId: cleanString(raw.costbookId),
    createdAt: cleanIsoDate(raw.createdAt, new Date().toISOString())
  };
}

function normalizeTakeoff(input) {
  const raw = input && typeof input === "object" ? input : {};
  return {
    projectId: cleanString(raw.projectId),
    projectName: cleanString(raw.projectName) || "Untitled takeoff",
    imageUrl: cleanString(raw.imageUrl),
    scale: normalizeScale(raw.scale),
    items: Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [],
    updatedAt: new Date().toISOString()
  };
}

function mapRow(row) {
  return { ...row, id: row._id.toString(), _id: undefined };
}

let costbookCache = null;
function loadCostbook() {
  try {
    costbookCache = JSON.parse(fs.readFileSync(COSTBOOK_PATH, "utf8"));
  } catch (_error) {
    costbookCache = costbookCache || { items: [] };
  }
  return costbookCache;
}

module.exports = function createTakeoffRouter(collection) {
  const router = express.Router();
  const noDb = { error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." };

  async function takeoffs() {
    return collection("takeoffs");
  }

  async function projectActuals() {
    return collection("projectActuals");
  }

  // Raw plan-image upload. Returns the /uploads URL to reference from a takeoff doc.
  router.post("/upload", express.raw({ type: ["image/*"], limit: "25mb" }), async (req, res) => {
    if (!req.body || !req.body.length) return res.status(400).json({ error: "No image data received." });
    const ext = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/gif": ".gif" })[cleanString(req.headers["content-type"]).split(";")[0]] || ".jpg";
    const safeName = cleanString(req.query.name || "plan").replace(/[^a-z0-9._-]/gi, "_").replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
    const file = `${genId()}-${safeName}${ext}`;
    const dir = path.join(UPLOADS_DIR, "takeoffs");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), req.body);
    res.status(201).json({ imageUrl: `/uploads/takeoffs/${file}`, file, uploadedAt: new Date().toISOString() });
  });

  router.get("/", async (req, res) => {
    const coll = await takeoffs();
    if (!coll) return res.status(503).json(noDb);
    const filter = cleanString(req.query.projectId) ? { projectId: cleanString(req.query.projectId) } : {};
    const rows = await coll.find(filter).sort({ updatedAt: -1 }).limit(300).toArray();
    res.json(rows.map(mapRow));
  });

  router.post("/", async (req, res) => {
    const coll = await takeoffs();
    if (!coll) return res.status(503).json(noDb);
    const doc = { ...normalizeTakeoff(req.body), createdAt: new Date().toISOString() };
    const result = await coll.insertOne(doc);
    res.status(201).json({ ...doc, id: result.insertedId.toString() });
  });

  router.put("/:id", async (req, res) => {
    const coll = await takeoffs();
    if (!coll) return res.status(503).json(noDb);
    // Merge onto the stored doc so a partial PUT (e.g. just {scale}) can't blank
    // unmentioned fields — same pattern as PUT /api/actuals/:id.
    const existing = await coll.findOne({ _id: new ObjectId(req.params.id) });
    const update = normalizeTakeoff(existing ? { ...existing, ...req.body } : req.body);
    await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ ...update, id: req.params.id, createdAt: (existing && existing.createdAt) || update.updatedAt });
  });

  router.delete("/:id", async (req, res) => {
    const coll = await takeoffs();
    if (!coll) return res.status(503).json(noDb);
    await coll.deleteOne({ _id: new ObjectId(req.params.id) });
    res.status(204).end();
  });

  // Push measured items into a job's cost lines (projectActuals collection).
  // Mirrors server.js normalizeActual()'s totals math so actualCost / grossMargin /
  // marginPercent stay consistent after the append (we can't require server.js —
  // it's the process entrypoint — so the math is duplicated here on purpose).
  router.post("/:id/push-to-project", async (req, res) => {
    const coll = await takeoffs();
    const projColl = await projectActuals();
    if (!coll || !projColl) return res.status(503).json(noDb);

    const takeoff = await coll.findOne({ _id: new ObjectId(req.params.id) });
    if (!takeoff) return res.status(404).json({ error: "Takeoff not found." });

    const projectId = cleanString((req.body && req.body.projectId) || takeoff.projectId);
    if (!projectId) return res.status(400).json({ error: "Set a project on this takeoff first." });

    const project = await projColl.findOne({ _id: new ObjectId(projectId) });
    if (!project) return res.status(404).json({ error: "Project not found." });

    const itemIds = Array.isArray(req.body && req.body.itemIds)
      ? req.body.itemIds.map(cleanString).filter(Boolean)
      : null;
    const items = (takeoff.items || []).filter((item) => !itemIds || itemIds.includes(item.id));
    if (!items.length) return res.status(400).json({ error: "No takeoff items to push." });

    const book = loadCostbook();
    const byId = new Map((book.items || []).map((item) => [item.id, item]));

    const newLines = items.map((item) => {
      const qty = Math.round(Number(item.value) || 0);
      const bookItem = item.costbookId ? byId.get(item.costbookId) : null;
      const actualTotal = 0;
      return {
        id: genId(),
        costbookId: item.costbookId || "",
        trade: bookItem ? bookItem.trade : "",
        description: item.label || "Takeoff item",
        qty,
        unit: item.unit || "job",
        actualTotal,
        actualUnit: qty ? Math.round((actualTotal / qty) * 100) / 100 : actualTotal,
        subName: "",
        notes: "From plan takeoff"
      };
    });

    const lines = (project.lines || []).concat(newLines);
    const actualCost = Math.round(lines.reduce((sum, line) => sum + (Number(line.actualTotal) || 0), 0));
    const contractPrice = Number(project.contractPrice || 0);
    const overheadCost = Number(project.overheadCost || 0);
    const grossMargin = Math.round(contractPrice - actualCost - overheadCost);
    const marginPercent = contractPrice ? Math.round(((contractPrice - actualCost - overheadCost) / contractPrice) * 100) : 0;

    await projColl.updateOne({ _id: project._id }, { $set: {
      lines, actualCost, grossMargin, marginPercent, updatedAt: new Date().toISOString()
    } });
    await coll.updateOne({ _id: takeoff._id }, { $set: { projectId, updatedAt: new Date().toISOString() } });

    res.json({ pushedCount: newLines.length, projectId, lines: newLines });
  });

  return router;
};

// MOUNT: crmApp.use("/api/takeoff", require("./takeoff")(collection));
