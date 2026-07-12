const express = require("express");
const { ObjectId } = require("mongodb");
const crypto = require("crypto");

// Permit tracker module (InstaPermit-lite, manual but organized) for the Joon
// subcontractor-finder CRM. Factory mirrors the style of suppliers.js:
// - `collection` is the app helper `async (name) => coll|null`.
// - every route returns 503 when `collection("permits")` is null (Mongo not configured).
// - :id routes look up documents by ObjectId.
// - PUT is merge-safe: it merges the incoming body onto the stored doc so a
//   partial PUT (e.g. just an inspection add) can't blank unmentioned fields.

const JURISDICTIONS = [
  "LADBS",
  "Burbank",
  "Glendale",
  "Pasadena",
  "Santa Monica",
  "Long Beach",
  "LA County",
  "other"
];

const PERMIT_TYPES = ["building", "electrical", "plumbing", "mechanical", "reroof", "pool", "solar", "demo", "other"];

const STATUSES = ["planning", "submitted", "plan_check", "corrections", "issued", "inspections", "finaled", "expired"];

const INSPECTION_RESULTS = ["scheduled", "passed", "partial", "failed"];

// Statuses that count as "waiting on the jurisdiction" for staleness purposes.
const STALE_STATUSES = ["submitted", "plan_check", "corrections"];

// Known jurisdiction permit-status portals (confirmed 2026-07-12). Used as the
// default portalUrl when a permit doc doesn't have its own link.
const PORTAL_URLS = {
  LADBS: "https://www.ladbsservices2.lacity.org/OnlineServices/PermitReport/PermitReport",
  Burbank: "https://permit.burbankca.gov/bop/",
  Glendale: "https://glendaleca-energovweb.tylerhost.net/apps/SelfService#/guidedapplication",
  Pasadena: "https://mypermits.cityofpasadena.net",
  "Santa Monica": "https://www.santamonica.gov/active-building-permits",
  "Long Beach": "https://permitslicenses.longbeach.gov/",
  "LA County": "https://epicla.lacounty.gov/"
};

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pickEnum(value, allowed, fallback) {
  const raw = cleanString(value);
  return allowed.includes(raw) ? raw : fallback;
}

function cleanDate(value) {
  const raw = cleanString(value);
  if (!raw) return "";
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : raw;
}

function normalizeInspection(input) {
  return {
    id: cleanString(input.id) || crypto.randomUUID(),
    type: cleanString(input.type),
    date: cleanDate(input.date),
    result: pickEnum(input.result, INSPECTION_RESULTS, "scheduled"),
    notes: cleanString(input.notes)
  };
}

function normalizeInspections(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeInspection);
}

function normalizePermit(input) {
  // Jurisdiction is a picklist of known agencies + free text ("other-free-text") —
  // don't force unknown values to "other", just keep whatever was typed.
  const jurisdiction = cleanString(input.jurisdiction) || "other";
  const portalUrl = cleanString(input.portalUrl) || PORTAL_URLS[jurisdiction] || "";
  return {
    projectId: cleanString(input.projectId),
    projectName: cleanString(input.projectName),
    jurisdiction,
    permitType: pickEnum(input.permitType, PERMIT_TYPES, "other"),
    permitNumber: cleanString(input.permitNumber),
    portalUrl,
    status: pickEnum(input.status, STATUSES, "planning"),
    submittedAt: cleanDate(input.submittedAt),
    issuedAt: cleanDate(input.issuedAt),
    expectedDays: Number(input.expectedDays) || 0,
    notes: cleanString(input.notes),
    inspections: normalizeInspections(input.inspections)
  };
}

function daysSince(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
}

module.exports = function createPermitsRouter(collection) {
  const router = express.Router();
  router.use(express.json({ limit: "2mb" }));

  async function permits() {
    return collection("permits");
  }

  function shape(row) {
    return { ...row, id: row._id.toString(), _id: undefined };
  }

  router.get("/", async (req, res) => {
    const coll = await permits();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const query = {};
    const projectId = cleanString(req.query.projectId);
    if (projectId) query.projectId = projectId;
    const rows = await coll.find(query).sort({ updatedAt: -1 }).toArray();
    res.json(rows.map(shape));
  });

  // Dashboard summary: counts by status + permits that have overstayed their
  // expected turnaround while waiting on the jurisdiction.
  router.get("/summary", async (_req, res) => {
    const coll = await permits();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const rows = await coll.find({}).toArray();
    const byStatus = {};
    STATUSES.forEach((s) => { byStatus[s] = 0; });
    const stale = [];
    rows.forEach((row) => {
      const status = STATUSES.includes(row.status) ? row.status : "planning";
      byStatus[status] = (byStatus[status] || 0) + 1;
      if (STALE_STATUSES.includes(status)) {
        const daysInStatus = daysSince(row.submittedAt);
        if (daysInStatus !== null && Number(row.expectedDays || 0) > 0 && daysInStatus > Number(row.expectedDays)) {
          stale.push({ ...shape(row), daysInStatus });
        }
      }
    });
    res.json({ counts: byStatus, total: rows.length, stale });
  });

  router.post("/", async (req, res) => {
    const coll = await permits();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const now = new Date().toISOString();
    const doc = { ...normalizePermit(req.body), createdAt: now, updatedAt: now };
    const result = await coll.insertOne(doc);
    res.status(201).json({ ...doc, id: result.insertedId.toString() });
  });

  router.put("/:id", async (req, res) => {
    const coll = await permits();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    let objectId;
    try { objectId = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid permit id." }); }
    const existing = await coll.findOne({ _id: objectId });
    if (!existing) return res.status(404).json({ error: "Permit not found." });
    // Merge onto the stored doc so a partial PUT (e.g. just adding an inspection)
    // can't blank unmentioned fields.
    const update = { ...normalizePermit({ ...existing, ...req.body }), createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    await coll.updateOne({ _id: objectId }, { $set: update });
    res.json({ ...update, id: req.params.id });
  });

  router.delete("/:id", async (req, res) => {
    const coll = await permits();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    let objectId;
    try { objectId = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid permit id." }); }
    await coll.deleteOne({ _id: objectId });
    res.status(204).end();
  });

  return router;
};

module.exports.JURISDICTIONS = JURISDICTIONS;
module.exports.PERMIT_TYPES = PERMIT_TYPES;
module.exports.STATUSES = STATUSES;
module.exports.INSPECTION_RESULTS = INSPECTION_RESULTS;
module.exports.PORTAL_URLS = PORTAL_URLS;

// MOUNT: crmApp.use("/api/permits", require("./permits")(collection));
