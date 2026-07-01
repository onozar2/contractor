const express = require("express");
const { ObjectId } = require("mongodb");

// Suppliers / Manufacturers module for the Joon subcontractor-finder CRM.
// Factory mirrors the style of the subcontractors routes in server.js:
// - `collection` is the app helper `async (name) => coll|null`.
// - every route returns 503 when `collection("suppliers")` is null (Mongo not configured).
// - :id routes look up documents by ObjectId.

const CATEGORIES = [
  "Windows & Doors",
  "Electrical",
  "Plumbing",
  "Roofing",
  "Paint",
  "Tile & Stone",
  "HVAC",
  "Drywall & Insulation",
  "Concrete & Masonry",
  "Lumber & Building Materials",
  "Cabinets & Countertops",
  "Solar"
];
const ACCOUNT_TYPES = ["distributor", "manufacturer-dealer", "big-box-pro", "supply-house"];
const ACCOUNT_STATUSES = ["not_started", "researching", "applied", "open"];

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanString).filter(Boolean))];
}

function cleanList(value) {
  if (Array.isArray(value)) return cleanArray(value);
  return cleanString(value).split(/\n|,/).map(cleanString).filter(Boolean);
}

function pickEnum(value, allowed, fallback) {
  const raw = cleanString(value);
  return allowed.includes(raw) ? raw : fallback;
}

function normalizeSupplier(input) {
  const doc = {
    name: cleanString(input.name),
    category: pickEnum(input.category, CATEGORIES, "Lumber & Building Materials"),
    brands: cleanList(input.brands),
    suppliesServices: cleanList(input.suppliesServices),
    accountType: pickEnum(input.accountType, ACCOUNT_TYPES, "distributor"),
    accountStatus: pickEnum(input.accountStatus, ACCOUNT_STATUSES, "not_started"),
    accountCostEstimate: cleanString(input.accountCostEstimate),
    accountRequirements: cleanString(input.accountRequirements),
    contactName: cleanString(input.contactName),
    phone: cleanString(input.phone),
    email: cleanString(input.email).toLowerCase(),
    website: cleanString(input.website),
    region: cleanString(input.region || "Southern California"),
    notes: cleanString(input.notes),
    sourceUrls: cleanList(input.sourceUrls)
  };
  return doc;
}

module.exports = function createSuppliersRouter(collection) {
  const router = express.Router();

  async function suppliers() {
    return collection("suppliers");
  }

  // Dedup on (name + category) or website — same shape as upsertSourcedSubcontractor.
  async function upsertSupplier(coll, input) {
    const now = new Date().toISOString();
    const doc = { ...normalizeSupplier(input), updatedAt: now };
    const existing = await coll.findOne({
      $or: [
        ...(doc.website ? [{ website: doc.website }] : []),
        ...(doc.name ? [{ name: doc.name, category: doc.category }] : [])
      ]
    });

    if (existing) {
      const merged = {
        ...doc,
        createdAt: existing.createdAt || now,
        brands: [...new Set([...(existing.brands || []), ...doc.brands])],
        suppliesServices: [...new Set([...(existing.suppliesServices || []), ...doc.suppliesServices])],
        sourceUrls: [...new Set([...(existing.sourceUrls || []), ...doc.sourceUrls])],
        // Preserve pipeline progress if the incoming record is a plain (re)seed.
        accountStatus: doc.accountStatus === "not_started" ? (existing.accountStatus || doc.accountStatus) : doc.accountStatus
      };
      await coll.updateOne({ _id: existing._id }, { $set: merged });
      return { ...merged, id: existing._id.toString(), updatedExisting: true };
    }

    const result = await coll.insertOne({ ...doc, createdAt: now });
    return { ...doc, createdAt: now, id: result.insertedId.toString(), updatedExisting: false };
  }

  router.get("/", async (_req, res) => {
    const coll = await suppliers();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const rows = await coll.find({}).sort({ category: 1, name: 1 }).toArray();
    res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
  });

  router.post("/", async (req, res) => {
    const coll = await suppliers();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const now = new Date().toISOString();
    const doc = { ...normalizeSupplier(req.body), createdAt: now, updatedAt: now };
    const result = await coll.insertOne(doc);
    res.status(201).json({ ...doc, id: result.insertedId.toString() });
  });

  router.post("/bulk", async (req, res) => {
    const coll = await suppliers();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const rows = Array.isArray(req.body.records) ? req.body.records : [];
    const saved = [];
    for (const row of rows.slice(0, 250)) {
      saved.push(await upsertSupplier(coll, row));
    }
    res.status(201).json({ savedCount: saved.length, saved });
  });

  router.put("/:id", async (req, res) => {
    const coll = await suppliers();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const update = { ...normalizeSupplier(req.body), updatedAt: new Date().toISOString() };
    await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ ...update, id: req.params.id });
  });

  router.delete("/:id", async (req, res) => {
    const coll = await suppliers();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    await coll.deleteOne({ _id: new ObjectId(req.params.id) });
    res.status(204).end();
  });

  return router;
};

module.exports.CATEGORIES = CATEGORIES;
module.exports.ACCOUNT_TYPES = ACCOUNT_TYPES;
module.exports.ACCOUNT_STATUSES = ACCOUNT_STATUSES;

// MOUNT: crmApp.use("/api/suppliers", require("./suppliers")(collection));
