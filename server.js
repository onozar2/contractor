const express = require("express");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const publicApp = express();
const crmApp = express();
const app = crmApp;
const publicPort = process.env.PUBLIC_PORT || process.env.PORT || 4373;
const crmPort = process.env.CRM_PORT || 4373;
const mongoUri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "contractor";

let clientPromise;

// ── White-label public site (zero-dependency brand system) ──
// A brand is a plain JSON file at brands/<slug>/brand.json. The active brand is
// chosen by process.env.BRAND (default "joon"); a ?brand=<slug> query overrides
// it for preview only. index.template.html carries {{tokens}} and <!--LOOP:key-->
// blocks that renderBrandedPage fills from the brand JSON.
const fs = require("fs");
const DEFAULT_BRAND = process.env.BRAND || "joon";
const brandCache = new Map();

function loadBrand(slug) {
  const clean = String(slug || "").replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  const key = clean || DEFAULT_BRAND;
  if (brandCache.has(key)) return brandCache.get(key);
  const file = path.join(__dirname, "brands", key, "brand.json");
  let brand;
  try {
    brand = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_error) {
    if (key !== DEFAULT_BRAND) return loadBrand(DEFAULT_BRAND);
    throw new Error(`Brand "${key}" not found and no fallback available at ${file}`);
  }
  brandCache.set(key, brand);
  return brand;
}

// Resolve a dotted path ("colors.ink") against the brand object; "." means the current loop item.
function lookup(context, expr, item) {
  const trimmed = String(expr).trim();
  if (trimmed === "." || trimmed === "this") return item;
  const root = item && Object.prototype.hasOwnProperty.call(Object(item), trimmed) ? item : context;
  return trimmed.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), root);
}

function fillTokens(str, context, item) {
  return String(str).replace(/\{\{([^}]+)\}\}/g, (_match, expr) => {
    const value = lookup(context, expr, item);
    return value == null ? "" : String(value);
  });
}

// Expand <!--LOOP:key-->...<!--/LOOP:key--> blocks by repeating the inner block per array item.
function renderLoops(template, brand) {
  const loopRe = /<!--LOOP:([^>]+?)-->([\s\S]*?)<!--\/LOOP:\1-->/g;
  return template.replace(loopRe, (_match, key, block) => {
    const list = lookup(brand, key);
    if (!Array.isArray(list)) return "";
    return list.map((item) => fillTokens(block, brand, item)).join("");
  });
}

function renderBrandedPage(templatePath, brand) {
  const template = fs.readFileSync(templatePath, "utf8");
  return fillTokens(renderLoops(template, brand), brand);
}

function activeBrand(req) {
  return loadBrand((req.query && req.query.brand) || DEFAULT_BRAND);
}

function serveIndex(req, res) {
  try {
    const html = renderBrandedPage(path.join(__dirname, "index.template.html"), activeBrand(req));
    res.type("html").send(html);
  } catch (error) {
    res.status(500).type("text").send(`Brand render error: ${error.message}`);
  }
}

// Root = the app (Ori: "just make it the app"). The public marketing page
// stays reachable at /index.html — when a real domain goes live, point "/"
// back at serveIndex and give the CRM auth.
publicApp.get("/", (_req, res) => res.redirect("/app.html"));
publicApp.get("/index.html", serveIndex);
publicApp.get("/flyer_services.html", (_req, res) => res.sendFile(path.join(__dirname, "flyer_services.html")));
publicApp.get("/flyer_commercial.html", (_req, res) => res.sendFile(path.join(__dirname, "flyer_commercial.html")));
publicApp.get("/market_report.html", (_req, res) => res.sendFile(path.join(__dirname, "market_report.html")));
publicApp.use("/assets", express.static(path.join(__dirname, "assets")));

// ── Public instant-estimate widget (BathMath-style, lead-gated) ──
publicApp.use(express.json({ limit: "200kb" }));
// Client-facing change-order approval + photo galleries + sub quote forms (token-gated)
publicApp.use("/co", require("./changeorders").publicRouter(collection));
publicApp.use("/gallery", require("./photofeed").publicRouter(collection));
publicApp.use("/rfq", require("./rfq").publicRouter(collection));
publicApp.get("/estimate.html", (_req, res) => res.sendFile(path.join(__dirname, "estimate.html")));

publicApp.get("/api/estimate-config", (_req, res) => {
  try {
    costbookCache = null;
    const book = loadCostbook();
    res.json(book.publicEstimator || { projectTypes: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function computePublicEstimate(config, input) {
  const ptype = (config.projectTypes || []).find((p) => p.key === cleanString(input.projectType));
  if (!ptype) return null;
  const size = (ptype.sizes || []).find((s) => s.key === cleanString(input.size)) || { factor: 1, label: "" };
  const finish = (config.finishLevels || []).find((f) => f.key === cleanString(input.finish)) || { factor: 1, label: "Mid-range" };
  const chosen = (ptype.options || []).filter((o) => Array.isArray(input.options) && input.options.includes(o.key));
  let low = ptype.base.low * size.factor + chosen.reduce((sum, o) => sum + o.low, 0);
  let high = ptype.base.high * size.factor + chosen.reduce((sum, o) => sum + o.high, 0);
  low = Math.round(low * finish.factor / 500) * 500;
  high = Math.round(high * finish.factor / 500) * 500;
  const typical = Math.round((low + (high - low) * 0.45) / 500) * 500;
  return { low, high, typical, duration: ptype.typicalDuration, drivers: ptype.drivers || [], label: ptype.label, sizeLabel: size.label, finishLabel: finish.label, optionLabels: chosen.map((o) => o.label) };
}

function scorePublicLead(config, input, estimate) {
  let score = 45;
  const timeline = (config.timelines || []).find((t) => t.key === cleanString(input.timeline));
  score += timeline ? timeline.score : 0;
  if (cleanString(input.ownerStatus) === "owner") score += 10;
  if (cleanString(input.ownerStatus) === "renter") score -= 25;
  const budget = Number(input.budgetMax || 0);
  if (budget && estimate) score += budget >= estimate.low * 0.8 ? 15 : -10;
  if (cleanString(input.phone)) score += 5;
  if (cleanString(input.notes).length > 20) score += 5;
  return clamp(Math.round(score), 0, 100);
}

publicApp.post("/api/estimate-lead", async (req, res) => {
  try {
    costbookCache = null;
    const config = loadCostbook().publicEstimator || {};
    const input = req.body || {};
    const estimate = computePublicEstimate(config, input);
    if (!estimate) return res.status(400).json({ error: "Pick a project type." });
    const name = cleanString(input.name);
    const email = cleanString(input.email).toLowerCase();
    const phone = cleanString(input.phone);
    if (!name || (!email && !phone)) return res.status(400).json({ error: "Name plus an email or phone are required to see your estimate." });

    const score = scorePublicLead(config, input, estimate);
    const leadId = `web-${Date.now().toString(36)}`;
    const coll = await collection("customerLeads");
    if (coll) {
      await coll.insertOne(normalizeLead({
        customerName: name,
        phone,
        email,
        city: cleanString(input.zip),
        projectType: estimate.label,
        source: "Website Estimator",
        status: "new",
        priority: score >= 70 ? "high" : score >= 50 ? "medium" : "low",
        estimatedValue: estimate.typical,
        probability: clamp(Math.round(score / 3), 5, 40),
        nextAction: score >= 70 ? "Hot web lead - call within 1 business day." : "Web lead - email planning range recap + qualify.",
        summary: `${estimate.label} | ${estimate.sizeLabel} | ${estimate.finishLabel} | range $${estimate.low.toLocaleString()}-$${estimate.high.toLocaleString()}`,
        notes: [
          `Lead ${leadId} · score ${score}/100`,
          `Options: ${estimate.optionLabels.join(", ") || "none"}`,
          `Timeline: ${cleanString(input.timeline)} · Budget max: ${input.budgetMax || "n/a"} · ${cleanString(input.ownerStatus) || "?"}`,
          cleanString(input.notes) ? `Homeowner notes: ${cleanString(input.notes)}` : ""
        ].filter(Boolean).join(" | "),
        sourcingMethod: "widget",
        agentStatus: "needs_review",
        sourceConfidence: "high"
      }));
    }
    res.json({ leadId, score, ...estimate });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

crmApp.use(express.json({ limit: "1mb" }));
// Superseded pages redirect into the app (files stay on disk; append ?legacy=1
// to any of these URLs to load the old page directly if ever needed).
const LEGACY_REDIRECTS = {
  "subcontractor_finder.html": "/app.html#/subs",
  "subs_database.html": "/app.html#/subs",
  "audit.html": "/app.html#/subs",
  "research_chat.html": "/app.html#/knowledge",
  "lead_generation.html": "/app.html#/pipeline",
  "services_board.html": "/app.html#/subs",
  "actuals.html": "/app.html#/projects",
  "suppliers.html": "/app.html#/suppliers"
};
for (const [page, target] of Object.entries(LEGACY_REDIRECTS)) {
  crmApp.get(`/${page}`, (req, res) => {
    if (req.query.legacy) return res.sendFile(path.join(__dirname, page));
    res.redirect(target);
  });
}
// Still-linked deep tools (opened from Potential projects / CO manager).
crmApp.get("/bid_lab.html", (_req, res) => res.sendFile(path.join(__dirname, "bid_lab.html")));
crmApp.get("/estimator.html", (_req, res) => res.sendFile(path.join(__dirname, "estimator.html")));
crmApp.get("/change_orders.html", (_req, res) => res.sendFile(path.join(__dirname, "change_orders.html")));
crmApp.get("/photo_feed.html", (_req, res) => res.sendFile(path.join(__dirname, "photo_feed.html")));
// Unified backend app (entity-centric redesign 2026-07-07)
crmApp.get("/app.html", (_req, res) => res.sendFile(path.join(__dirname, "app.html")));
for (const moduleFile of ["app_subs.js", "app_projects.js", "app_pipeline.js", "app_knowledge.js", "app_suppliers.js"]) {
  crmApp.get(`/${moduleFile}`, (_req, res) => res.sendFile(path.join(__dirname, moduleFile)));
}
crmApp.use("/api/knowledge", require("./knowledge")(collection));
crmApp.use("/api/suppliers", require("./suppliers")(collection));
crmApp.use("/api/changeorders", require("./changeorders")(collection));
crmApp.use("/api/photofeed", require("./photofeed")(collection));
crmApp.use("/api/rfq", require("./rfq")(collection));
crmApp.use("/assets", express.static(path.join(__dirname, "assets")));

function getClient() {
  if (!mongoUri) return null;
  if (!clientPromise) {
    const client = new MongoClient(mongoUri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

async function collection(name = "subcontractors") {
  const client = await getClient();
  if (!client) return null;
  return client.db(dbName).collection(name);
}

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function daysUntilDate(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  if (Number.isNaN(time)) return null;
  return Math.round((time - Date.now()) / 86400000);
}

function pickEnum(value, allowed, fallback) {
  const raw = cleanString(value).toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

// Blend the research-based initial score with observed job performance.
// Weight of job history grows with completed-job count and dominates after ~4 jobs.
function blendScores(fitScore, jobScore, jobCount) {
  const jobs = Number(jobCount || 0);
  if (!jobs || !Number.isFinite(Number(jobScore))) return clamp(Math.round(Number(fitScore || 0)), 0, 100);
  const weight = Math.min(0.75, 0.25 + jobs * 0.125);
  return clamp(Math.round(Number(fitScore || 0) * (1 - weight) + Number(jobScore) * weight), 0, 100);
}

const OUTREACH_STAGES = ["not_contacted", "queued", "contacted", "responded", "pricing_received", "vetted", "preferred", "rejected"];

// ── Compliance packet (in-house HeyPros-style doc tracking) ──
// Four docs gate a sub from "responded" to "vetted": COI naming us additional
// insured, W-9, signed sub agreement, workers-comp cert (or exemption).
const DOC_KEYS = ["coi", "w9", "agreement", "workersCompCert"];
const DOC_LABELS = { coi: "COI (additional insured)", w9: "W-9", agreement: "Signed sub agreement", workersCompCert: "Workers comp cert" };

function normalizeDocChecklist(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  for (const key of DOC_KEYS) {
    const item = src[key] || {};
    out[key] = {
      status: pickEnum(item.status, ["missing", "requested", "received", "exempt", "expired"], "missing"),
      expiresAt: cleanString(item.expiresAt),
      note: cleanString(item.note)
    };
  }
  return out;
}

function complianceSummary(record) {
  const checklist = record.docChecklist || {};
  const missing = [];
  for (const key of DOC_KEYS) {
    const item = checklist[key] || {};
    const days = daysUntilDate(item.expiresAt);
    const expired = days !== null && days < 0;
    const ok = (item.status === "received" && !expired) || item.status === "exempt";
    if (!ok) missing.push(key);
  }
  return { complete: missing.length === 0, missing, received: DOC_KEYS.length - missing.length, total: DOC_KEYS.length };
}

function computeOwnerReachScore(doc) {
  let s = 0;
  if (cleanString(doc.ownerName)) s += 45;
  if (cleanString(doc.email)) s += 25;
  if (cleanString(doc.phone)) s += 20;
  if (cleanString(doc.ownerTitle)) s += 5;
  if (cleanString(doc.licenseNumber)) s += 5;
  return clamp(Math.round(s), 0, 100);
}

function scoreSubcontractor(input) {
  const rating = Number(input.reviewRating || 0);
  const reviewCount = Number(input.reviewCount || 0);
  const sentiment = cleanString(input.sentiment).toLowerCase();
  const sourceConfidence = cleanString(input.sourceConfidence || "medium").toLowerCase();
  const bondedStatus = cleanString(input.bondedStatus || "unknown").toLowerCase();
  let score = 35;

  if (rating > 0) score += clamp((rating - 3) * 16, -20, 32);
  score += clamp(Math.log10(reviewCount + 1) * 7, 0, 16);
  if (sentiment === "positive") score += 12;
  if (sentiment === "mixed") score += 3;
  if (sentiment === "negative") score -= 14;
  if (cleanString(input.phone)) score += 5;
  if (cleanString(input.email)) score += 5;
  if (cleanString(input.website)) score += 4;
  if (input.licenseVerified) score += 8;
  if (input.insuranceVerified) score += 5;
  if (input.additionalInsured) score += 4;
  const insExpiry = daysUntilDate(input.insuranceExpiresAt);
  if (insExpiry !== null) score += insExpiry < 0 ? -14 : insExpiry <= 30 ? -5 : 5;
  const licExpiry = daysUntilDate(input.licenseExpiresAt);
  if (licExpiry !== null) score += licExpiry < 0 ? -10 : licExpiry <= 30 ? -3 : 3;
  if (/bonded|verified|active|yes/.test(bondedStatus)) score += 4;
  if (/active|verified|current/i.test(input.workersCompStatus || "")) score += 4;
  if (/active|verified|current/i.test(input.generalLiabilityStatus || "")) score += 4;
  if (/supplier_referral|job_site|permit_data|sub_referral/i.test(input.sourceChannel || "")) score += 8;
  if (/net_30_verified|good_standing/i.test(input.net30Status || "")) score += 6;
  if (/cash_only/i.test(input.net30Status || "")) score -= 6;
  if (cleanString(input.fieldSupervisor)) score += 3;
  if (cleanString(input.recentProjects)) score += 4;
  if (cleanString(input.lienHistoryNotes) && !/none|clear|not found/i.test(input.lienHistoryNotes)) score -= 5;
  if (/preferred|qualified|outreach_ready/i.test(input.chaseState || "")) score += 6;
  if (sourceConfidence === "high") score += 8;
  if (sourceConfidence === "low") score -= 7;
  if (cleanArray(input.specialties).length >= 2) score += 4;
  if (cleanString(input.ownerName)) score += 4;
  if (cleanString(input.reachTier) === "owner") score += 10;
  if (cleanString(input.ownerReachConfidence).toLowerCase() === "high") score += 4;

  return clamp(Math.round(score), 0, 100);
}

// ── Dedupe keys ──
// Aggregator profile URLs (yelp.com/biz/x) keep their path so two different
// profiles never collide; real company domains collapse to the bare host.
const AGGREGATOR_HOSTS = /(yelp|bbb|facebook|instagram|google|angi|houzz|homeadvisor|thumbtack|nextdoor)\./i;
function dedupeNameKey(name) {
  return cleanString(name).toLowerCase()
    .replace(/\b(inc|llc|corp|corporation|co|company|the|and|&)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}
function dedupeSiteKey(url) {
  let w = cleanString(url).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  if (!w) return "";
  return AGGREGATOR_HOSTS.test(w) ? w : w.replace(/\/.*$/, "");
}
function dedupePhoneKey(phone) {
  const digits = cleanString(phone).replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? digits : "";
}

// ── Vetting: record completeness (0-100) ──
// Weighted share of the fields that matter for outreach + hiring decisions.
function computeCompletenessScore(doc) {
  const has = (v) => Boolean(cleanString(typeof v === "string" ? v : v ? String(v) : ""));
  let score = 0;
  // identity + reach (40)
  if (has(doc.companyName)) score += 4;
  if (has(doc.serviceCategory)) score += 4;
  if (has(doc.phone)) score += 8;
  if (has(doc.email)) score += 8;
  if (has(doc.website)) score += 6;
  if (has(doc.ownerName)) score += 6;
  if (has(doc.ownerTitle)) score += 2;
  if (has(doc.linkedIn)) score += 2;
  // compliance (30)
  if (has(doc.licenseNumber)) score += 10;
  if (doc.licenseVerified) score += 5;
  if (has(doc.generalLiabilityStatus)) score += 4;
  if (has(doc.workersCompStatus)) score += 3;
  if (has(doc.insuranceExpiresAt)) score += 2;
  if (has(doc.licenseExpiresAt)) score += 2;
  if (doc.docChecklist && Object.values(doc.docChecklist).some((item) => item && item.status && item.status !== "missing")) score += 4;
  // reputation (21)
  if (Number(doc.reviewRating) > 0) score += 6;
  if (Number(doc.reviewCount) > 0) score += 3;
  if (has(doc.sentiment) && doc.sentiment !== "unknown") score += 2;
  if (has(doc.summary)) score += 4;
  if (cleanArray(doc.sourceUrls).length) score += 3;
  if (has(doc.recentProjects)) score += 3;
  // operational detail (9)
  if (has(doc.crewSize)) score += 2;
  if (has(doc.serviceArea)) score += 1;
  if (cleanArray(doc.specialties).length) score += 2;
  if (has(doc.priceTier) && doc.priceTier !== "unknown") score += 1;
  if (has(doc.minimumJobSize)) score += 1;
  if (doc.bringsOwnMaterials && doc.bringsOwnMaterials !== "unknown") score += 2;
  return clamp(Math.round(score), 0, 100);
}

// ── Vetting: legitimacy/reputation (0-100) ──
// Evidence the business is real, licensed, and reputable. Distinct from fitScore
// (which mixes in outreach-pipeline signals); this is pure "would you trust them
// on a job site" evidence. Our own logged jobs are the strongest signal.
function computeLegitScore(doc) {
  let score = 20;
  const licStatus = cleanString(doc.licenseStatus).toLowerCase();
  if (doc.licenseVerified) score += 25;
  else if (cleanString(doc.licenseNumber)) score += 12;
  if (licStatus === "active") score += 10;
  else if (/expired|suspended|revoked/.test(licStatus)) score -= 25;
  else if (licStatus === "not_found") score -= 20;
  if (doc.websiteAlive === true) score += 8;
  else if (doc.websiteAlive === false) score -= 10;
  const rating = Number(doc.reviewRating || 0);
  if (rating >= 4.5) score += 15;
  else if (rating >= 4) score += 10;
  else if (rating >= 3.5) score += 5;
  else if (rating > 0 && rating < 3) score -= 10;
  const reviews = Number(doc.reviewCount || 0);
  if (reviews >= 100) score += 10;
  else if (reviews >= 25) score += 7;
  else if (reviews >= 5) score += 4;
  if (cleanString(doc.ownerName)) score += 5;
  if (cleanString(doc.reachTier) === "owner") score += 5;
  if (doc.insuranceVerified) score += 5;
  if (/active|verified|current/i.test(doc.workersCompStatus || "")) score += 4;
  if (/bonded|verified|active|yes/i.test(doc.bondedStatus || "")) score += 3;
  if (cleanString(doc.sourceConfidence).toLowerCase() === "high") score += 5;
  if (cleanString(doc.sourceConfidence).toLowerCase() === "low") score -= 5;
  if (Number(doc.jobCount) > 0) score += Number(doc.jobScore) >= 70 ? 12 : 6;
  score -= cleanArray(doc.redFlags).length * 15;
  return clamp(Math.round(score), 0, 100);
}
function legitTierFor(score, redFlags) {
  if (cleanArray(redFlags).length && score < 45) return "flagged";
  if (score >= 75) return "verified";
  if (score >= 55) return "credible";
  if (score >= 35) return "unverified";
  return "risky";
}

function normalize(input) {
  const doc = {
    companyName: cleanString(input.companyName),
    contactName: cleanString(input.contactName),
    phone: cleanString(input.phone),
    email: cleanString(input.email).toLowerCase(),
    website: cleanString(input.website),
    linkedIn: cleanString(input.linkedIn),
    ownerName: cleanString(input.ownerName || input.contactName),
    ownerTitle: cleanString(input.ownerTitle),
    ownerReachConfidence: cleanString(input.ownerReachConfidence || "").toLowerCase(),
    ownerReachEvidence: cleanString(input.ownerReachEvidence),
    serviceCategory: cleanString(input.serviceCategory),
    specialties: cleanList(input.specialties),
    serviceArea: cleanString(input.serviceArea || "Southern California"),
    sourceChannel: cleanString(input.sourceChannel || input.sourcingMethod || "manual"),
    referralSource: cleanString(input.referralSource),
    supplierName: cleanString(input.supplierName),
    jobSiteAddress: cleanString(input.jobSiteAddress),
    permitJurisdiction: cleanString(input.permitJurisdiction),
    permitReference: cleanString(input.permitReference),
    crewSize: cleanString(input.crewSize),
    fieldSupervisor: cleanString(input.fieldSupervisor),
    bringsOwnMaterials: pickEnum(input.bringsOwnMaterials, ["yes", "no", "partial", "unknown"], "unknown"),
    docChecklist: normalizeDocChecklist(input.docChecklist),
    outreachStage: pickEnum(input.outreachStage, OUTREACH_STAGES, "not_contacted"),
    net30Status: cleanString(input.net30Status || "unknown"),
    unionStatus: cleanString(input.unionStatus || "unknown"),
    responsivenessScore: Number(input.responsivenessScore || 0),
    qualityScore: Number(input.qualityScore || 0),
    minimumJobSize: cleanString(input.minimumJobSize),
    unitPriceNotes: cleanString(input.unitPriceNotes),
    laborRateHints: cleanString(input.laborRateHints),
    mobilizationFee: cleanString(input.mobilizationFee),
    typicalQuoteTurnaround: cleanString(input.typicalQuoteTurnaround),
    bidInputRequirements: cleanString(input.bidInputRequirements),
    pricingExclusions: cleanString(input.pricingExclusions),
    quoteConfidence: cleanString(input.quoteConfidence || "unknown"),
    licenseNumber: cleanString(input.licenseNumber),
    licenseClass: cleanString(input.licenseClass || input.licenseType),
    licenseType: cleanString(input.licenseType || input.licenseClass),
    licenseSourceUrl: cleanString(input.licenseSourceUrl),
    licenseSourceNotes: cleanString(input.licenseSourceNotes),
    licenseLastCheckedAt: cleanString(input.licenseLastCheckedAt),
    workersCompStatus: cleanString(input.workersCompStatus),
    generalLiabilityStatus: cleanString(input.generalLiabilityStatus),
    bondedStatus: cleanString(input.bondedStatus || "unknown"),
    dirRegistrationStatus: cleanString(input.dirRegistrationStatus),
    insuranceExpiresAt: cleanString(input.insuranceExpiresAt),
    licenseExpiresAt: cleanString(input.licenseExpiresAt),
    additionalInsured: Boolean(input.additionalInsured),
    recentProjects: cleanString(input.recentProjects),
    projectPhotos: cleanList(input.projectPhotos),
    lienHistoryNotes: cleanString(input.lienHistoryNotes),
    vettingStatus: cleanString(input.vettingStatus || (input.licenseVerified ? "license_checked" : "needs_vetting")),
    licenseVerified: Boolean(input.licenseVerified),
    insuranceVerified: Boolean(input.insuranceVerified),
    reviewRating: Number(input.reviewRating || 0),
    reviewCount: Number(input.reviewCount || 0),
    reviewSource: cleanString(input.reviewSource),
    sentiment: cleanString(input.sentiment || "unknown"),
    priceTier: cleanString(input.priceTier || "unknown"),
    summary: cleanString(input.summary),
    sourceUrls: cleanList(input.sourceUrls),
    sourceNotes: cleanString(input.sourceNotes),
    sourceConfidence: cleanString(input.sourceConfidence || "medium"),
    sourcingMethod: cleanString(input.sourcingMethod || "manual"),
    sourcingRunId: cleanString(input.sourcingRunId),
    agentStatus: cleanString(input.agentStatus || "needs_review"),
    chaseState: cleanString(input.chaseState || input.status || "new"),
    nextFollowUpAt: cleanString(input.nextFollowUpAt),
    lastContactedAt: cleanString(input.lastContactedAt),
    chaseNotes: cleanString(input.chaseNotes),
    status: cleanString(input.status || "researching"),
    lastResearchedAt: input.lastResearchedAt || new Date().toISOString(),
    // vetting layer
    licenseStatus: cleanString(input.licenseStatus || "unchecked").toLowerCase(),
    websiteAlive: typeof input.websiteAlive === "boolean" ? input.websiteAlive : null,
    websiteCheckedAt: cleanString(input.websiteCheckedAt),
    redFlags: cleanList(input.redFlags),
    vettingNotes: cleanString(input.vettingNotes),
    lastVettedAt: cleanString(input.lastVettedAt),
    // Ori's own people (WhatsApp/phone contacts) pin to the top everywhere.
    trusted: Boolean(input.trusted),
    // Manual hide; hiddenAuto (computed) hides flagged/risky/dead records.
    hidden: Boolean(input.hidden)
  };
  const hasChannel = Boolean(doc.phone || doc.email);
  doc.reachTier = doc.ownerName && hasChannel ? "owner" : hasChannel ? "company" : "none";
  const providedReach = Number(input.ownerReachScore);
  doc.ownerReachScore = Number.isFinite(providedReach) && providedReach > 0
    ? clamp(Math.round(providedReach), 0, 100)
    : computeOwnerReachScore(doc);
  if (!doc.ownerReachConfidence) {
    if (doc.ownerReachScore >= 75) doc.ownerReachConfidence = "high";
    else if (doc.ownerReachScore >= 45) doc.ownerReachConfidence = "medium";
    else doc.ownerReachConfidence = "low";
  }
  doc.fitScore = scoreSubcontractor(doc);
  doc.nameKey = dedupeNameKey(doc.companyName);
  doc.siteKey = dedupeSiteKey(doc.website);
  doc.phoneKey = dedupePhoneKey(doc.phone);
  doc.completenessScore = computeCompletenessScore(doc);
  doc.legitScore = computeLegitScore({ ...doc, jobCount: input.jobCount, jobScore: input.jobScore });
  doc.legitTier = legitTierFor(doc.legitScore, doc.redFlags);
  doc.contactStrength = doc.ownerName && doc.email ? "strong" : (doc.email || doc.phone) ? "weak" : "none";
  return doc;
}

// ── Job history → performance score ──
// Each logged job rates quality / timeliness / priceFairness / communication 1-10.
// A job's score is the dimension average on a 0-100 scale, cut 30% on a no-rehire.
function scoreJob(job) {
  const dims = ["quality", "timeliness", "priceFairness", "communication"]
    .map((key) => clamp(Number(job[key] || 0), 0, 10))
    .filter((value) => value > 0);
  if (!dims.length) return 0;
  let score = (dims.reduce((sum, value) => sum + value, 0) / dims.length) * 10;
  if (job.wouldRehire === false) score *= 0.7;
  return clamp(Math.round(score), 0, 100);
}

function normalizeJob(input) {
  return {
    projectName: cleanString(input.projectName),
    trade: cleanString(input.trade),
    completedAt: cleanString(input.completedAt || new Date().toISOString().slice(0, 10)),
    contractValue: Number(input.contractValue || 0),
    quality: clamp(Number(input.quality || 0), 0, 10),
    timeliness: clamp(Number(input.timeliness || 0), 0, 10),
    priceFairness: clamp(Number(input.priceFairness || 0), 0, 10),
    communication: clamp(Number(input.communication || 0), 0, 10),
    wouldRehire: input.wouldRehire !== false,
    suppliedOwnMaterials: pickEnum(input.suppliedOwnMaterials, ["yes", "no", "partial", "unknown"], "unknown"),
    notes: cleanString(input.notes),
    createdAt: new Date().toISOString()
  };
}

async function recomputeJobScore(subId) {
  const jobsColl = await collection("subcontractorJobs");
  const subColl = await collection("subcontractors");
  if (!jobsColl || !subColl) return null;
  const record = await subColl.findOne({ _id: new ObjectId(subId) });
  if (!record) return null;
  const jobs = await jobsColl.find({ subcontractorId: subId }).toArray();
  const scores = jobs.map(scoreJob).filter((score) => score > 0);
  const jobScore = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  const update = {
    jobCount: jobs.length,
    jobScore,
    overallScore: blendScores(record.fitScore, jobScore, scores.length),
    lastJobAt: jobs.map((job) => job.completedAt).sort().pop() || "",
    updatedAt: new Date().toISOString()
  };
  await subColl.updateOne({ _id: record._id }, { $set: update });
  return update;
}

function buildSubcontractorChaseTask(record, mode = "both") {
  const contact = record.contactName || "there";
  const company = record.companyName || "your company";
  const trade = record.serviceCategory || "construction";
  const sourceContext = [
    record.supplierName ? `supplier referral from ${record.supplierName}` : "",
    record.jobSiteAddress ? `job-site observation at ${record.jobSiteAddress}` : "",
    record.permitReference ? `permit/project reference ${record.permitReference}` : "",
    record.referralSource ? `referral from ${record.referralSource}` : "",
    record.net30Status && record.net30Status !== "unknown" ? `supplier account signal: ${record.net30Status}` : "",
    record.sourceChannel && record.sourceChannel !== "manual" ? `source channel: ${record.sourceChannel}` : ""
  ].filter(Boolean).join("; ");
  const opener = sourceContext
    ? `I came across ${company} through ${sourceContext}.`
    : `I came across ${company} while building our subcontractor roster for Southern California work.`;
  const subject = `Subcontractor roster - ${trade}`;
  const emailBody = [
    `Hi ${contact.split(/\s+/)[0] || "there"},`,
    "",
    `${opener} My name is Ori Nozar with Joon Development Group. We are building a short list of reliable ${trade} partners for upcoming Los Angeles / Southern California projects.`,
    "",
    "Are you open to being considered for our bid/field partner roster? If so, I would like to understand your service area, crew capacity, best estimating contact, CSLB license, and insurance/COI status.",
    "",
    "No pressure if you are full right now. I am mainly trying to build a quality roster of subs who communicate well, are properly licensed/insured, and can be a long-term fit.",
    "",
    "Best,",
    "Ori Nozar",
    "(818) 371-0334"
  ].join("\n");
  const phoneScript = [
    `Hi ${contact.split(/\s+/)[0] || "there"}, this is Ori Nozar with Joon Development Group.`,
    "I know I am calling out of the blue, so I will be brief.",
    opener,
    `We are building a vetted roster of ${trade} subcontractors for Southern California projects.`,
    "Do you take on work from GCs or owner-builders, and who is the best person for estimates?",
    "",
    "Questions to cover:",
    "1. What areas do you cover?",
    "2. What scope do you prefer and avoid?",
    "3. How many people are usually in the field crew?",
    "4. Who supervises field work day to day?",
    "5. Is your CSLB license active, and can you provide COI/workers comp if we request it?",
    "6. What is the best way to send plans or a scope?",
    "7. What photos, measurements, or drawings do you need to give a budget number within 24-48 hours?",
    "8. Are you bonded, and is there anything we should verify before adding you to our preferred roster?"
  ].join("\n");
  return {
    subcontractorId: record._id?.toString?.() || record.id || "",
    mode,
    subject,
    emailBody,
    phoneScript,
    followUpPlan: "If no response, follow up in 5 business days. If they answer, mark responded and request license/COI plus preferred bid email.",
    sourceContext
  };
}

function buildDocsRequestTask(record) {
  const first = cleanString(record.contactName || record.ownerName || "there").split(/\s+/)[0] || "there";
  const company = record.companyName || "your company";
  const summary = complianceSummary(record);
  const stillNeeded = summary.missing.map((key) => DOC_LABELS[key]);
  const subject = `Paperwork to get ${company} on our approved roster`;
  const emailBody = [
    `Hi ${first},`,
    "",
    `Great connecting. To add ${company} to our approved subcontractor roster and start sending you work, I just need the standard packet:`,
    "",
    ...stillNeeded.map((label, i) => `${i + 1}. ${label}${label.startsWith("COI") ? " - certificate holder + additional insured: Joon Development Group" : ""}`),
    "",
    "Reply with PDFs whenever convenient - photos of the originals work too. If workers comp does not apply to you (owner-operator, no employees), just say so and I will mark you exempt.",
    "",
    "Once these are in you are first call for your trade.",
    "",
    "Best,",
    "Ori Nozar",
    "Joon Development Group",
    "(818) 371-0334"
  ].join("\n");
  return {
    subcontractorId: record._id?.toString?.() || record.id || "",
    mode: "docs",
    subject,
    emailBody,
    phoneScript: `Hi ${first}, Ori with Joon Development Group. Quick one - to get ${company} on our approved roster I need ${stillNeeded.join(", ") || "nothing, you're complete"}. What's the best email to send the checklist to?`,
    stillNeeded,
    followUpPlan: "If docs not received in 5 business days, follow up once by phone. Mark each doc received/exempt in the compliance card; sub flips to vetted when the packet is complete."
  };
}

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueMatches(text, regex, limit = 8) {
  const matches = [];
  let match;
  while ((match = regex.exec(text)) && matches.length < limit) {
    matches.push(cleanString(match[0]));
  }
  return [...new Set(matches)];
}

function inferSentiment(text) {
  const positive = ["excellent", "professional", "responsive", "quality", "recommended", "reliable", "on time", "honest", "great"];
  const negative = ["complaint", "late", "unresponsive", "poor", "bad", "lawsuit", "delay", "over budget", "terrible"];
  const lower = text.toLowerCase();
  const positives = positive.filter((word) => lower.includes(word)).length;
  const negatives = negative.filter((word) => lower.includes(word)).length;
  if (positives > negatives + 1) return "positive";
  if (negatives > positives) return "negative";
  if (positives || negatives) return "mixed";
  return "unknown";
}

function inferPriceTier(text) {
  const lower = text.toLowerCase();
  if (lower.includes("premium") || lower.includes("luxury") || lower.includes("high-end")) return "$$$";
  if (lower.includes("affordable") || lower.includes("budget") || lower.includes("low cost")) return "$";
  if (lower.includes("free estimate") || lower.includes("competitive")) return "$$";
  return "unknown";
}

function inferBondedStatus(text) {
  const lower = cleanString(text).toLowerCase();
  if (/\bnot\s+bonded\b/.test(lower)) return "not_bonded";
  if (/\bbonded\b|\bbondable\b/.test(lower)) return "bonded";
  return "unknown";
}

function extractRating(text) {
  const ratingMatch = text.match(/([1-5](?:\.\d)?)\s*(?:out of\s*)?5\s*(?:stars?|rating)?/i) || text.match(/rating[:\s]+([1-5](?:\.\d)?)/i);
  const countMatch = text.match(/([\d,]+)\s*(?:reviews?|ratings?)/i);
  return {
    reviewRating: ratingMatch ? Number(ratingMatch[1]) : 0,
    reviewCount: countMatch ? Number(countMatch[1].replace(/,/g, "")) : 0
  };
}

function extractLicenseDetails(text) {
  const cleaned = cleanString(text);
  const licensePatterns = [
    /\b(?:CSLB|contractor'?s?\s+license|license|lic\.?|CA\s+license|California\s+license)\s*(?:no\.?|number|#|:)?\s*([0-9]{6,8})\b/ig,
    /\b(?:CSLB|lic\.?)\s*#?\s*([0-9]{6,8})\b/ig
  ];
  const licenseNumbers = [];
  for (const pattern of licensePatterns) {
    let match;
    while ((match = pattern.exec(cleaned)) && licenseNumbers.length < 5) {
      licenseNumbers.push(match[1]);
    }
  }
  const classMatch = cleaned.match(/\b(?:class|classification)\s*(?:-|:)?\s*((?:A|B|C)(?:[- ]?\d{1,2})?(?:\s*[-/]\s*[A-Za-z][A-Za-z ]{2,36})?)/i);
  const statusMatch = cleaned.match(/\b(active|current|inactive|expired|suspended|revoked)\b/i);
  return {
    licenseNumber: [...new Set(licenseNumbers)][0] || "",
    licenseClass: classMatch ? cleanString(classMatch[1]).toUpperCase() : "",
    licenseType: classMatch ? cleanString(classMatch[1]).toUpperCase() : "",
    licenseStatusText: statusMatch ? cleanString(statusMatch[1]).toLowerCase() : "",
    found: Boolean(licenseNumbers.length)
  };
}

function extractOwnerName(text) {
  const clean = cleanString(text);
  const patterns = [
    /\b(?:owner|founder|co-?founder|president|principal|proprietor|owned\s+and\s+operated\s+by|founded\s+by|owned\s+by)\s*(?:&|and|\/|is|:|-)?\s*(?:owner|operator)?\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/,
    /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+),?\s+(?:the\s+)?(?:owner|founder|president|principal|proprietor)\b/
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m && m[1]) {
      const name = cleanString(m[1]);
      if (name.split(/\s+/).length >= 2 && name.length <= 40) {
        const titleM = clean.match(/\b(owner|founder|co-?founder|president|principal|proprietor)\b/i);
        return { name, title: titleM ? cleanString(titleM[1]) : "Owner" };
      }
    }
  }
  return { name: "", title: "" };
}

function parseResearchPage(url, html) {
  const title = decodeEntities(cleanString((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).replace(/&#8211;|&#x2013;/g, "-"));
  const meta = cleanString((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1]);
  const text = textFromHtml(html);
  const phones = uniqueMatches(text, /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g);
  const emails = uniqueMatches(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  const rating = extractRating(text);
  const license = extractLicenseDetails(text);
  const owner = extractOwnerName(text);
  const summary = cleanString(meta || text.slice(0, 260));
  const reviewSource = sourceTypeForUrl(url);
  const hasChannel = Boolean(phones[0] || emails[0]);

  return {
    companyName: title.replace(/\s*[-|].*$/, ""),
    ownerName: owner.name,
    ownerTitle: owner.title,
    phone: phones[0] || "",
    email: emails[0] || "",
    website: url,
    licenseNumber: license.licenseNumber,
    licenseClass: license.licenseClass,
    licenseType: license.licenseType,
    licenseVerified: license.found,
    bondedStatus: inferBondedStatus(text),
    reviewRating: rating.reviewRating,
    reviewCount: rating.reviewCount,
    reviewSource,
    sentiment: inferSentiment(text),
    priceTier: inferPriceTier(text),
    summary,
    sourceUrls: [url],
    sourceNotes: `Imported from ${reviewSource}. Found ${phones.length} phone(s), ${emails.length} email(s), owner ${owner.name || "not found"}, license ${license.licenseNumber || "not found"}, rating ${rating.reviewRating || "not found"}, reviews ${rating.reviewCount || "not found"}.`,
    sourceConfidence: (owner.name && hasChannel) || license.found ? "high" : (hasChannel || rating.reviewRating ? "medium" : "low"),
    pageTextSample: text.slice(0, 1800)
  };
}

function decodeEntities(value) {
  return cleanString(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeDuckUrl(url) {
  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.href;
  } catch (_error) {
    return url;
  }
}

async function fetchHtml(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "JoonSourcingAgent/1.0 (+source-backed local CRM)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const html = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

// Decode Bing's /ck/a redirect links: real URL is base64url in the `u` param, prefixed "a1".
function decodeBingUrl(url) {
  try {
    const parsed = new URL(url, "https://www.bing.com");
    if (!/bing\.com$/i.test(parsed.hostname) || !parsed.pathname.startsWith("/ck")) return url;
    const raw = parsed.searchParams.get("u") || "";
    const b64 = raw.replace(/^a1/, "").replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    return /^https?:\/\//i.test(decoded) ? decoded : url;
  } catch (_error) {
    return url;
  }
}

function parseDuckHtml(html, searchUrl, limit) {
  const results = [];
  const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = resultRegex.exec(html)) && results.length < limit) {
    const url = decodeDuckUrl(decodeEntities(match[1]));
    if (!/^https?:\/\//i.test(url)) continue;
    results.push({ title: decodeEntities(textFromHtml(match[2])), url, snippet: decodeEntities(textFromHtml(match[3])), searchUrl });
  }
  if (!results.length) {
    const fallbackRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = fallbackRegex.exec(html)) && results.length < limit) {
      const url = decodeDuckUrl(decodeEntities(match[1]));
      if (!/^https?:\/\//i.test(url)) continue;
      results.push({ title: decodeEntities(textFromHtml(match[2])), url, snippet: "", searchUrl });
    }
  }
  return results;
}

function parseDuckLite(html, searchUrl, limit) {
  const results = [];
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
  const snippets = [];
  const snippetRegex = /<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;
  let snippetMatch;
  while ((snippetMatch = snippetRegex.exec(html))) snippets.push(decodeEntities(textFromHtml(snippetMatch[1])));
  let match;
  while ((match = linkRegex.exec(html)) && results.length < limit) {
    const url = decodeDuckUrl(decodeEntities(match[1]));
    if (!/^https?:\/\//i.test(url)) continue;
    results.push({ title: decodeEntities(textFromHtml(match[2])), url, snippet: snippets[results.length] || "", searchUrl });
  }
  return results;
}

function parseBingHtml(html, searchUrl, limit) {
  const results = [];
  const blockRegex = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = blockRegex.exec(html)) && results.length < limit) {
    const url = decodeBingUrl(decodeEntities(match[1]));
    if (!/^https?:\/\//i.test(url) || /bing\.com/i.test(hostname(url))) continue;
    const snippetMatch = match[3].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    results.push({ title: decodeEntities(textFromHtml(match[2])), url, snippet: snippetMatch ? decodeEntities(textFromHtml(snippetMatch[1])) : "", searchUrl });
  }
  return results;
}

// DuckDuckGo started serving bot challenges (HTTP 202 + anomaly page) to the old
// scraper, so search now tries multiple engines with a browser UA until one yields.
const SEARCH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchSearchHtml(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": SEARCH_UA, "accept": "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" }
    });
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Brave Search API (2,000 free queries/month) — most reliable path when a key
// is configured via BRAVE_API_KEY in .env; scrapers below are the free fallback.
async function searchBraveApi(query, limit) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return null;
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(limit + 4, 20)}`, {
    headers: { "X-Subscription-Token": key, "accept": "application/json" }
  });
  if (!response.ok) throw new Error(`Brave API HTTP ${response.status}`);
  const data = await response.json();
  return (data.web && data.web.results || []).slice(0, limit).map((result) => ({
    title: cleanString(result.title),
    url: result.url,
    snippet: cleanString(textFromHtml(result.description || "")),
    searchUrl: "brave-api"
  }));
}

// Bing's no-JS SERP sometimes degrades to first-word matching (dictionary pages).
// If most titles share no meaningful query term, treat the engine as failed.
function bingLooksDegraded(results, query) {
  const words = cleanString(query).toLowerCase().split(/\s+/).filter((word) => word.length >= 4 && !word.startsWith("-"));
  if (!words.length || !results.length) return false;
  const misses = results.filter((result) => {
    const hay = `${result.title} ${result.snippet}`.toLowerCase();
    return !words.some((word) => hay.includes(word));
  });
  return misses.length > results.length / 2;
}

async function searchWeb(query, limit = 6) {
  const errors = [];
  try {
    const brave = await searchBraveApi(query, limit);
    if (brave && brave.length) return brave;
    if (brave) errors.push("brave-api: 0 results");
  } catch (error) {
    errors.push(`brave-api: ${error.message}`);
  }

  const engines = [
    { url: `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, parse: parseDuckLite, retryable: true },
    { url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, parse: parseDuckHtml, retryable: true },
    { url: `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.max(10, limit)}`, parse: parseBingHtml }
  ];
  for (const engine of engines) {
    for (let attempt = 0; attempt < (engine.retryable ? 2 : 1); attempt++) {
      if (attempt > 0) await sleep(2500);
      try {
        const html = await fetchSearchHtml(engine.url);
        if (/anomaly|captcha|challenge-form|<title>\s*Captcha/i.test(html.slice(0, 4000))) { errors.push(`${hostname(engine.url)}: challenge page`); continue; }
        const results = engine.parse(html, engine.url, limit);
        if (results.length && engine.parse === parseBingHtml && bingLooksDegraded(results, query)) {
          errors.push(`${hostname(engine.url)}: degraded first-word results`);
          break;
        }
        if (results.length) return results;
        errors.push(`${hostname(engine.url)}: 0 results`);
      } catch (error) {
        errors.push(`${hostname(engine.url)}: ${error.message}`);
      }
    }
  }
  throw new Error(`All search engines failed for "${query}": ${errors.join(" | ")}`);
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
}

function companyFromResult(result) {
  return cleanString(result.title.replace(/\s*[-|].*$/, "").replace(/\s+\|?\s*(Yelp|Angi|HomeAdvisor|BBB|LinkedIn).*$/i, ""));
}

function sourceTypeForUrl(url) {
  const host = hostname(url);
  if (host.includes("yelp")) return "Yelp";
  if (host.includes("angi")) return "Angi";
  if (host.includes("homeadvisor")) return "HomeAdvisor";
  if (host.includes("bbb")) return "BBB";
  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("craigslist")) return "Craigslist";
  return host || "Public web";
}

function isBlockedSubcontractorSource(url, title = "", snippet = "") {
  const host = hostname(url);
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch (_error) {
      return "";
    }
  })();
  const text = `${title} ${snippet} ${url}`.toLowerCase();
  if (host.includes("duckduckgo.com") && /\/y\.js|ad_domain|ad_provider|aclick/.test(`${path} ${text}`)) return true;
  const blockedHosts = [
    "careerjet.com",
    "indeed.com",
    "monster.com",
    "jooble.org",
    "simplyhired.com",
    "arcgis.com",
    "clca.org",
    "clca-lasgv.org",
    "ua345.org",
    "dir.ca.gov",
    "ladwp.com",
    "lacity.org",
    "lacitydbs.org",
    "permitla.org",
    "dbs.lacity.gov",
    "engpermits.lacity.org",
    "bca.lacity.gov",
    "permitgrab.com",
    "subcontractorfinder.com",
    "firstchoicelandscapesupply.com",
    "patagoniabuildingsupplies.com",
    "expertise.com",
    "thehomeatlas.com",
    "craigslist.org"
  ];
  if (blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return true;
  if (host.includes("linkedin.com") && !path.startsWith("/company/")) return true;
  if (host.includes("yelp.com") && !path.startsWith("/biz")) return true;
  if (host.includes("angi.com") && /\/search|category-/.test(path)) return true;
  if (host.includes("houzz.com") && /(photos|ideabooks)/.test(path)) return true;
  if (host.includes("bbb.org") && /\/category\/|\/search/.test(path)) return true;
  if (host.includes("facebook.com") && /(marketplace|\/jobs|\/groups|\/events|category)/.test(path)) return true;
  return /\b(top\s+10|best\s+15|jobs?\s+board|employment|now hiring|preferred vendors|vendors and bidders|permit portal|permit and inspection|landscape supply|building supplies|buying group|local union|public works contractors|directory of)\b/i.test(text);
}

function validateSubcontractorCandidate(result, enriched, serviceCategory, market) {
  const host = hostname(result.url);
  const searchable = cleanString([
    result.title,
    result.snippet,
    enriched.companyName,
    enriched.summary,
    enriched.sourceNotes,
    enriched.pageTextSample
  ].join(" "));
  const lower = searchable.toLowerCase();
  if (isBlockedSubcontractorSource(result.url, result.title, result.snippet)) {
    return { ok: false, reason: "Skipped non-contractor source category." };
  }

  const contractorTerms = /\b(contractor|subcontractor|construction|builder|remodel(?:er|ing)?|renovation|licensed|cslb|general contractor|landscape contractor|drainage contractor|masonry|electric(?:al|ian)?|plumb(?:ing|er)?|hvac|roof(?:ing|er)?|drywall|framing|flooring|tile|waterproofing|concrete|hardscape|painting|cabinetry|millwork|windows?|doors?)\b/i;
  const negativeTerms = /\b(job board|apply now|employment|hiring|association|union|wholesale supplier|supplier directory|directory|marketplace|top 10|best 15|search results|government portal|permit portal|vendor portal)\b/i;
  const serviceWords = cleanString(serviceCategory)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5 && !["remodels", "renovations", "contractor", "subcontractor"].includes(word));
  const hasTradeEvidence = !serviceWords.length || serviceWords.some((word) => lower.includes(word));
  const hasContractorEvidence = contractorTerms.test(searchable);
  const hasContactEvidence = Boolean(enriched.phone || enriched.email || enriched.licenseNumber);
  const isLinkedInCompany = host.includes("linkedin.com") && /\/company\//i.test(result.url);
  const isPlatformProfile = isLinkedInCompany
    || (host.includes("yelp.com") && /\/biz\//i.test(result.url))
    || host.includes("angi.com")
    || host.includes("bbb.org")
    || host.includes("facebook.com")
    || host.includes("instagram.com")
    || host.includes("houzz.com");
  const marketWords = cleanString(market).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
  const hasMarketEvidence = !marketWords.length || marketWords.some((word) => lower.includes(word)) || /southern california|los angeles|greater la|ventura|orange county|san fernando|pasadena|glendale|santa monica|beverly hills/i.test(searchable);

  if (negativeTerms.test(searchable) && !isPlatformProfile) {
    return { ok: false, reason: "Skipped page with directory/job/supplier language." };
  }
  if (!hasContractorEvidence || !hasTradeEvidence) {
    return { ok: false, reason: "Skipped because fetched page did not show contractor/trade evidence." };
  }
  if (!hasContactEvidence && !isPlatformProfile) {
    return { ok: false, reason: "Skipped because page did not expose phone, email, or license evidence." };
  }
  if (!hasMarketEvidence) {
    return { ok: false, reason: "Skipped because page did not show market/service-area evidence." };
  }

  const method = isLinkedInCompany
    ? "Verified against LinkedIn company profile text."
    : enriched.licenseNumber
      ? "Verified against fetched website text with license evidence."
      : "Verified against fetched contractor website text with contact evidence.";
  return { ok: true, method };
}

function mergeUrls(...groups) {
  return [...new Set(groups.flat().map(cleanString).filter(Boolean))];
}

async function enrichPublicResult(result) {
  try {
    const html = await fetchHtml(result.url, 9000);
    const parsed = parseResearchPage(result.url, html);
    return {
      ...parsed,
      sourceNotes: cleanString([parsed.sourceNotes, `Fetched and parsed ${hostname(result.url) || result.url}.`].join(" "))
    };
  } catch (error) {
    return {
      companyName: companyFromResult(result),
      website: result.url,
      summary: result.snippet,
      sourceUrls: [result.url],
      sourceNotes: `Search result from ${sourceTypeForUrl(result.url)}. Page fetch blocked or unavailable: ${error.message}.`,
      sourceConfidence: "low"
    };
  }
}

async function findSubcontractorLicense(record) {
  const companyName = cleanString(record.companyName);
  const serviceArea = cleanString(record.serviceArea || "Los Angeles CA");
  if (!companyName) return { found: false, sourceNotes: "No company name available for license search." };

  const queries = [
    `"${companyName}" CSLB license`,
    `"${companyName}" contractor license ${serviceArea}`,
    `site:cslb.ca.gov "${companyName}"`,
    record.website ? `"${companyName}" "${hostname(record.website)}" license` : ""
  ].filter(Boolean);

  const seen = new Set();
  for (const query of queries) {
    const results = await searchWeb(query, 4);
    for (const result of results) {
      const resultText = `${result.title} ${result.snippet}`;
      const fromSnippet = extractLicenseDetails(resultText);
      if (fromSnippet.found) {
        return {
          ...fromSnippet,
          found: true,
          licenseSourceUrl: result.url,
          licenseSourceNotes: `License found from search result. Query: "${query}". Snippet: ${result.snippet || result.title}`
        };
      }

      const key = result.url.toLowerCase().replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const html = await fetchHtml(result.url, 9000);
        const pageText = textFromHtml(html);
        const fromPage = extractLicenseDetails(pageText);
        if (fromPage.found) {
          return {
            ...fromPage,
            found: true,
            licenseSourceUrl: result.url,
            licenseSourceNotes: `License found from public page. Query: "${query}". Page title: ${result.title}`
          };
        }
      } catch (_error) {
        // Some directories block page fetches; snippet evidence above is still checked.
      }
    }
  }

  return {
    found: false,
    licenseSourceNotes: `No specific license number found after targeted searches: ${queries.join(" | ")}`
  };
}

async function enrichLicenseForSubcontractor(id) {
  const coll = await collection("subcontractors");
  if (!coll) throw new Error("MongoDB is not configured. Set MONGODB_URI to enable server persistence.");
  const record = await coll.findOne({ _id: new ObjectId(id) });
  if (!record) throw new Error("Subcontractor not found.");
  const result = await findSubcontractorLicense(record);
  const now = new Date().toISOString();
  const update = {
    licenseLastCheckedAt: now,
    licenseSourceNotes: result.licenseSourceNotes || ""
  };
  if (result.found) {
    update.licenseNumber = result.licenseNumber;
    update.licenseClass = result.licenseClass || record.licenseClass || "";
    update.licenseType = result.licenseType || result.licenseClass || record.licenseType || record.licenseClass || "";
    update.licenseSourceUrl = result.licenseSourceUrl || "";
    update.licenseVerified = true;
    update.sourceConfidence = record.sourceConfidence === "low" ? "medium" : (record.sourceConfidence || "medium");
    update.sourceUrls = mergeUrls(record.sourceUrls || [], [result.licenseSourceUrl]);
    update.sourceNotes = cleanString([record.sourceNotes, result.licenseSourceNotes].filter(Boolean).join(" | "));
  }
  await coll.updateOne({ _id: record._id }, { $set: { ...update, updatedAt: now } });
  return { id, companyName: record.companyName, ...result, licenseLastCheckedAt: now };
}

async function upsertSourcedSubcontractor(coll, input) {
  const now = new Date().toISOString();
  const doc = { ...normalize(input), updatedAt: now };
  // Match on normalized keys so "Foo Inc."/"Foo, INC" or http/https/www variants
  // of the same company can't create duplicates. Phone alone is NOT a match key
  // by itself across trades (one owner can run two businesses on one line).
  const orClauses = [
    ...(doc.website ? [{ website: doc.website }] : []),
    ...(doc.siteKey ? [{ siteKey: doc.siteKey }] : []),
    ...(doc.companyName ? [{ companyName: doc.companyName, serviceCategory: doc.serviceCategory }] : []),
    ...(doc.nameKey ? [{ nameKey: doc.nameKey }] : []),
    ...(doc.phoneKey ? [{ phoneKey: doc.phoneKey, serviceCategory: doc.serviceCategory }] : [])
  ];
  const existing = await coll.findOne({ $or: orClauses });

  if (existing) {
    const merged = {
      ...doc,
      createdAt: existing.createdAt || now,
      sourceUrls: mergeUrls(existing.sourceUrls || [], doc.sourceUrls || []),
      sourceNotes: cleanString([existing.sourceNotes, doc.sourceNotes].filter(Boolean).join(" | ")),
      sourcingMethod: existing.sourcingMethod === "manual" ? "manual" : doc.sourcingMethod,
      // Never let a re-seed regress human-entered pipeline state or job history.
      outreachStage: existing.outreachStage && existing.outreachStage !== "not_contacted" ? existing.outreachStage : doc.outreachStage,
      bringsOwnMaterials: doc.bringsOwnMaterials !== "unknown" ? doc.bringsOwnMaterials : (existing.bringsOwnMaterials || "unknown"),
      docChecklist: existing.docChecklist && Object.values(existing.docChecklist).some((item) => item && item.status !== "missing") ? existing.docChecklist : doc.docChecklist,
      overallScore: blendScores(doc.fitScore, existing.jobScore, existing.jobCount),
      // ...nor regress vetting evidence (deep-vet results, website checks, red flags).
      licenseStatus: doc.licenseStatus !== "unchecked" ? doc.licenseStatus : (existing.licenseStatus || "unchecked"),
      websiteAlive: doc.websiteAlive !== null ? doc.websiteAlive : (existing.websiteAlive ?? null),
      websiteCheckedAt: doc.websiteCheckedAt || existing.websiteCheckedAt || "",
      redFlags: cleanArray(doc.redFlags).length ? doc.redFlags : (existing.redFlags || []),
      vettingNotes: doc.vettingNotes || existing.vettingNotes || "",
      lastVettedAt: doc.lastVettedAt || existing.lastVettedAt || "",
      vettingStatus: existing.vettingStatus === "deep_vetted" ? "deep_vetted" : doc.vettingStatus,
      trusted: doc.trusted || Boolean(existing.trusted),
      hidden: doc.hidden || Boolean(existing.hidden),
      licenseVerified: doc.licenseVerified || Boolean(existing.licenseVerified),
      licenseNumber: doc.licenseNumber || existing.licenseNumber || "",
      reviewRating: Number(doc.reviewRating) > 0 ? doc.reviewRating : (existing.reviewRating || 0),
      reviewCount: Number(doc.reviewCount) > 0 ? doc.reviewCount : (existing.reviewCount || 0),
      reviewSource: doc.reviewSource || existing.reviewSource || ""
    };
    // Recompute scores off the preserved evidence, not the raw incoming doc.
    Object.assign(merged, vettingFieldsFor({ ...merged, jobCount: existing.jobCount, jobScore: existing.jobScore }));
    await coll.updateOne({ _id: existing._id }, { $set: merged });
    return { ...merged, id: existing._id.toString(), updatedExisting: true };
  }

  const result = await coll.insertOne({ ...doc, overallScore: doc.fitScore, createdAt: now });
  return { ...doc, id: result.insertedId.toString(), updatedExisting: false };
}

// ── Trade presets: tuned search vocabulary per trade so one click runs a
// trade-specific sweep (roofing, electrical, glass...) instead of generic terms.
const TRADE_PRESETS = [
  { key: "roofing", label: "Roofing", serviceCategory: "Roofing", search: "roofing contractor roofer", hints: "shingle tile TPO torch down C-39" },
  { key: "electrical", label: "Electrical", serviceCategory: "Electrical", search: "electrical contractor electrician", hints: "C-10 panel upgrade rewire" },
  { key: "glass", label: "Glass & Glazing", serviceCategory: "Glass & Glazing", search: "glazing contractor glass and mirror shower door installer", hints: "C-17 storefront IGU frameless" },
  { key: "plumbing", label: "Plumbing", serviceCategory: "Plumbing", search: "plumbing contractor plumber", hints: "C-36 repipe sewer tankless" },
  { key: "hvac", label: "HVAC", serviceCategory: "HVAC", search: "HVAC contractor heating air conditioning", hints: "C-20 mini split ducting" },
  { key: "framing", label: "Framing & Carpentry", serviceCategory: "Framing & Carpentry", search: "framing contractor rough carpentry crew", hints: "ADU addition structural" },
  { key: "drywall", label: "Drywall", serviceCategory: "Drywall and framing", search: "drywall contractor hanging taping", hints: "C-9 level 5 smooth" },
  { key: "foundation", label: "Foundation & Retrofit", serviceCategory: "Foundation & Retrofit", search: "foundation repair contractor seismic retrofit", hints: "underpinning bolting cripple wall" },
  { key: "concrete", label: "Concrete & Hardscape", serviceCategory: "Concrete and hardscape", search: "concrete contractor hardscape", hints: "C-8 driveway pavers" },
  { key: "painting", label: "Painting", serviceCategory: "Painting", search: "painting contractor painter", hints: "C-33 interior exterior" },
  { key: "flooring", label: "Flooring", serviceCategory: "Flooring", search: "flooring contractor installer", hints: "C-15 hardwood LVP refinishing" },
  { key: "tile", label: "Tile & Waterproofing", serviceCategory: "Tile and waterproofing", search: "tile contractor tile setter", hints: "C-54 shower pan waterproofing" },
  { key: "cabinets", label: "Cabinetry & Millwork", serviceCategory: "Cabinetry and millwork", search: "cabinet installer custom cabinetry millwork", hints: "C-6 shop kitchen" },
  { key: "windows", label: "Windows & Doors", serviceCategory: "Windows and doors", search: "window and door installation contractor", hints: "retrofit replacement Milgard" },
  { key: "landscape", label: "Landscape & Drainage", serviceCategory: "Landscape and drainage", search: "landscape contractor drainage", hints: "C-27 irrigation french drain" },
  { key: "turf", label: "Turf & Synthetic Grass", serviceCategory: "Turf & Synthetic Grass", search: "artificial turf installer synthetic grass", hints: "putting green pet turf" },
  { key: "pool", label: "Pool Construction", serviceCategory: "Pool Construction", search: "pool builder pool contractor", hints: "C-53 gunite remodel plaster" },
  { key: "solar", label: "Solar", serviceCategory: "Solar and electrical storage", search: "solar installation contractor", hints: "C-46 battery storage panel" },
  { key: "insulation", label: "Insulation", serviceCategory: "Insulation", search: "insulation contractor", hints: "C-2 spray foam blown-in" },
  { key: "stucco", label: "Stucco & Plastering", serviceCategory: "Stucco & Plastering", search: "stucco contractor plastering", hints: "C-35 lath smooth finish" },
  { key: "waterproofing", label: "Waterproofing & Deck Coating", serviceCategory: "Waterproofing & Deck Coating", search: "waterproofing deck coating contractor", hints: "C-39 balcony below grade SB-721" },
  { key: "restoration", label: "Mold & Restoration", serviceCategory: "Mold & Restoration", search: "mold remediation water damage restoration", hints: "IICRC certified" },
  { key: "demolition", label: "Demolition & Grading", serviceCategory: "Demolition & Grading", search: "demolition contractor grading", hints: "C-21 haul off excavation" },
  { key: "steel", label: "Structural Steel & Welding", serviceCategory: "Structural Steel & Welding", search: "structural steel welding contractor", hints: "C-51 moment frame fabrication" },
  { key: "masonry", label: "Masonry & Hardscape", serviceCategory: "Masonry & Hardscape", search: "masonry contractor mason", hints: "C-29 block retaining wall veneer" },
  { key: "fencing", label: "Fencing & Gates", serviceCategory: "Fencing & Gates", search: "fence contractor gates", hints: "C-13 iron vinyl automatic" },
  { key: "gutters", label: "Rain Gutters", serviceCategory: "Rain Gutters", search: "rain gutter installation contractor", hints: "seamless downspout" },
  { key: "garage", label: "Garage Doors", serviceCategory: "Garage Doors", search: "garage door installation repair company", hints: "opener spring" },
  { key: "lowvoltage", label: "Low Voltage & Security", serviceCategory: "Low voltage and security", search: "low voltage contractor security cameras", hints: "C-7 network AV" },
  { key: "firesprinklers", label: "Fire Sprinklers", serviceCategory: "Fire Sprinklers", search: "fire sprinkler contractor", hints: "C-16 NFPA 13D residential" },
  { key: "countertops", label: "Countertops & Stone", serviceCategory: "Countertops & Stone Fabrication", search: "countertop fabricator stone fabrication", hints: "quartz slab install" },
  { key: "kitchenbath", label: "Kitchen & Bath", serviceCategory: "Kitchen and bath remodels", search: "kitchen bathroom remodel subcontractor", hints: "B license design build" },
  { key: "architecture", label: "Architecture & Design", serviceCategory: "Architecture & Design", search: "residential architect ADU plans", hints: "permit ready plan sets" },
  { key: "structural", label: "Structural Engineering", serviceCategory: "Structural Engineering", search: "structural engineer residential", hints: "PE SE calcs retrofit ADU" },
  { key: "geotech", label: "Geotechnical & Soils", serviceCategory: "Geotechnical & Soils", search: "geotechnical engineer soils report", hints: "hillside ADU soil report" },
  { key: "title24", label: "Title 24 & Energy", serviceCategory: "Title 24 & Energy", search: "Title 24 energy consultant", hints: "HERS CF1R residential" }
];

function findTradePreset(value) {
  const raw = cleanString(value).toLowerCase();
  if (!raw) return null;
  return TRADE_PRESETS.find((preset) => preset.key === raw)
    || TRADE_PRESETS.find((preset) => preset.serviceCategory.toLowerCase() === raw)
    || TRADE_PRESETS.find((preset) => preset.label.toLowerCase() === raw)
    || null;
}

// Run fn over items with at most `limit` in flight (finder fetches are IO-bound).
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await fn(items[current], current);
      } catch (error) {
        results[current] = { __error: error.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function buildSubcontractorQueries(input) {
  const preset = findTradePreset(input.tradeKey || input.serviceCategory);
  const service = cleanString((preset && preset.search) || input.serviceCategory || "general contractor subcontractor");
  const hints = preset ? cleanString(preset.hints) : "";
  const market = cleanString(input.market || "Los Angeles CA");
  const sources = cleanArray(input.sources).length
    ? cleanArray(input.sources)
    : ["Yelp", "Google", "Angi", "Instagram", "Facebook", "BBB", "CSLB", "company websites"];
  // Owner-reach mindset: bias toward owner-named, reachable, reviewed profiles.
  // Only job boards are excluded now — review/social platforms are where owner-operators live.
  const exclusions = "-jobs -careers -hiring -\"apply now\" -\"top 10\" -\"best 15\"";
  const base = [
    `${service} ${market} licensed insured phone ${exclusions}`,
    `${service} ${market} "family owned" ${exclusions}`,
    hints ? `${service} ${hints.split(/\s+/).slice(0, 3).join(" ")} ${market} ${exclusions}` : `${service} ${market} CSLB license ${exclusions}`
  ];
  const sourceQueries = sources.map((source) => {
    if (/yelp/i.test(source)) return `${service} ${market} site:yelp.com/biz`;
    if (/google/i.test(source)) return `${service} contractor ${market} owner reviews phone ${exclusions}`;
    if (/angi|angie/i.test(source)) return `${service} ${market} site:angi.com`;
    if (/instagram|ig/i.test(source)) return `${service} contractor ${market} site:instagram.com`;
    if (/facebook|fb|meta/i.test(source)) return `${service} contractor ${market} site:facebook.com`;
    if (/bbb/i.test(source)) return `${service} ${market} owner site:bbb.org`;
    if (/nextdoor/i.test(source)) return `${service} contractor ${market} site:nextdoor.com`;
    if (/linkedin/i.test(source)) return `site:linkedin.com/company ${service} contractor ${market}`;
    if (/permit|cslb|license/i.test(source)) return `${service} contractor ${market} CSLB license owner phone ${exclusions}`;
    if (/supplier|referral/i.test(source)) return `${service} contractor ${market} owner licensed supplier recommended ${exclusions}`;
    return `${source} ${service} contractor ${market} owner licensed insured ${exclusions}`;
  });
  return [...new Set([...sourceQueries, ...base])].slice(0, Number(input.queryLimit || 10));
}

async function runSubcontractorAgent(input) {
  const coll = await collection("subcontractors");
  if (!coll) throw new Error("MongoDB is not configured. Set MONGODB_URI to enable server persistence.");
  const startedAt = Date.now();
  const runId = `sub-agent-${startedAt}`;
  const preset = findTradePreset(input.tradeKey || input.serviceCategory);
  const serviceCategory = cleanString(input.serviceCategory || (preset && preset.serviceCategory) || "General subcontractor");
  const market = cleanString(input.market || "Los Angeles CA");
  const maxResults = clamp(Number(input.maxResults || 12), 1, 30);
  const minFitScore = clamp(Number(input.minFitScore || 0), 0, 100);
  const queries = buildSubcontractorQueries({ ...input, serviceCategory });
  const errors = [];
  const skipped = [];

  // 1. All search queries in parallel (bounded), then dedupe and pre-filter
  //    before spending any page fetches.
  // Search engines rate-limit aggressively: 2 concurrent with a stagger keeps DDG happy.
  const searchBatches = await mapLimit(queries, 2, async (query, index) => {
    await sleep(index * 700);
    return searchWeb(query, Math.ceil(maxResults / queries.length) + 3);
  });
  const seen = new Set();
  const candidates = [];
  searchBatches.forEach((batch, i) => {
    if (batch && batch.__error) {
      errors.push({ query: queries[i], error: batch.__error });
      return;
    }
    for (const result of batch || []) {
      const key = result.url.toLowerCase().replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      if (isBlockedSubcontractorSource(result.url, result.title, result.snippet)) {
        skipped.push({ title: result.title, url: result.url, reason: "Blocked source category (pre-fetch).", query: queries[i] });
        continue;
      }
      candidates.push({ ...result, query: queries[i] });
    }
  });

  // 2. Skip candidates whose host is already in the database (no wasted fetches, no dupes).
  const existingSites = await coll.find({ website: { $ne: "" } }, { projection: { website: 1 } }).toArray();
  const knownHosts = new Set(existingSites.map((row) => hostname(row.website)).filter(Boolean));
  const fresh = candidates.filter((candidate) => {
    const host = hostname(candidate.url);
    const isDirectory = /yelp|angi|bbb|linkedin|facebook|instagram|houzz/.test(host);
    if (!isDirectory && knownHosts.has(host)) {
      skipped.push({ title: candidate.title, url: candidate.url, reason: "Already in database (matched website host).", query: candidate.query });
      return false;
    }
    return true;
  }).slice(0, maxResults * 3);

  // 3. Enrich (fetch + parse) in parallel batches of 4.
  const enrichedAll = await mapLimit(fresh, 4, (candidate) => enrichPublicResult(candidate));

  // 4. Validate + score-gate + save.
  const saved = [];
  for (let i = 0; i < fresh.length && saved.length < maxResults; i++) {
    const result = fresh[i];
    const enriched = enrichedAll[i] && !enrichedAll[i].__error ? enrichedAll[i] : null;
    if (!enriched) {
      skipped.push({ title: result.title, url: result.url, reason: `Enrichment failed: ${enrichedAll[i] && enrichedAll[i].__error}`, query: result.query });
      continue;
    }
    const sourceType = sourceTypeForUrl(result.url);
    const validation = validateSubcontractorCandidate(result, enriched, serviceCategory, market);
    if (!validation.ok) {
      skipped.push({ title: result.title, url: result.url, reason: validation.reason, query: result.query });
      continue;
    }
    const candidateDoc = {
      ...enriched,
      companyName: enriched.companyName || companyFromResult(result),
      serviceCategory,
      serviceArea: market,
      specialties: [serviceCategory],
      reviewSource: enriched.reviewSource || sourceType,
      sourceUrls: mergeUrls(enriched.sourceUrls || [], [result.url, result.searchUrl]),
      sourceNotes: cleanString([
        `Agent run ${runId}. Query: "${result.query}". Source: ${sourceType}.`,
        validation.method,
        result.snippet ? `Snippet: ${result.snippet}` : "",
        enriched.sourceNotes
      ].filter(Boolean).join(" ")),
      status: "researching",
      sourcingMethod: "agent",
      sourcingRunId: runId,
      agentStatus: "needs_review",
      sourceConfidence: enriched.licenseNumber ? "high" : (enriched.sourceConfidence || "medium")
    };
    if (minFitScore > 0) {
      const projectedScore = scoreSubcontractor(normalize(candidateDoc));
      if (projectedScore < minFitScore) {
        skipped.push({ title: result.title, url: result.url, reason: `Fit score ${projectedScore} below threshold ${minFitScore}.`, query: result.query });
        continue;
      }
    }
    saved.push(await upsertSourcedSubcontractor(coll, candidateDoc));
  }

  const durationMs = Date.now() - startedAt;
  const runs = await collection("sourcingRuns");
  if (runs) {
    await runs.insertOne({
      runId,
      type: "subcontractor",
      serviceCategory,
      market,
      queries,
      minFitScore,
      candidateCount: candidates.length,
      savedCount: saved.length,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 80),
      errors,
      durationMs,
      createdAt: new Date().toISOString()
    });
  }

  return { runId, serviceCategory, market, queries, minFitScore, candidateCount: candidates.length, savedCount: saved.length, skippedCount: skipped.length, skipped, saved, errors, durationMs };
}

app.get("/api/health", async (_req, res) => {
  const hasMongo = Boolean(mongoUri);
  res.json({ ok: true, mongoConfigured: hasMongo, dbName });
});

app.get("/api/subcontractors", async (_req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ fitScore: -1, companyName: 1 }).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/subcontractors", async (req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const now = new Date().toISOString();
  const doc = { ...normalize(req.body), createdAt: now, updatedAt: now };
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.post("/api/subcontractors/bulk", async (req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = Array.isArray(req.body.records) ? req.body.records : [];
  const saved = [];
  for (const row of rows.slice(0, 250)) {
    saved.push(await upsertSourcedSubcontractor(coll, {
      ...row,
      sourcingMethod: cleanString(row.sourcingMethod || "csv"),
      agentStatus: cleanString(row.agentStatus || "needs_review"),
      sourceConfidence: cleanString(row.sourceConfidence || "low")
    }));
  }
  res.status(201).json({ savedCount: saved.length, saved });
});

app.post("/api/subcontractors/agent-search", async (req, res) => {
  try {
    const result = await runSubcontractorAgent(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/subcontractors/:id/license-search", async (req, res) => {
  try {
    const result = await enrichLicenseForSubcontractor(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/subcontractors/:id/activities", async (req, res) => {
  const coll = await collection("subcontractorActivities");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({ subcontractorId: req.params.id }).sort({ occurredAt: -1, createdAt: -1 }).limit(100).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/subcontractors/:id/activities", async (req, res) => {
  const activityColl = await collection("subcontractorActivities");
  const subColl = await collection("subcontractors");
  if (!activityColl || !subColl) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const now = new Date().toISOString();
  const activity = {
    subcontractorId: req.params.id,
    type: cleanString(req.body.type || "note"),
    contactName: cleanString(req.body.contactName),
    outcome: cleanString(req.body.outcome || "logged"),
    subject: cleanString(req.body.subject),
    notes: cleanString(req.body.notes),
    occurredAt: cleanString(req.body.occurredAt || now),
    createdAt: now
  };
  await activityColl.insertOne(activity);
  const update = { updatedAt: now, chaseNotes: cleanString(req.body.notes) };
  if (activity.type === "phone_call" || activity.type === "outbound_email") {
    update.lastContactedAt = activity.occurredAt;
    update.status = activity.outcome === "bid_requested" || activity.outcome === "meeting_scheduled" ? "bid requested" : "called";
    update.chaseState = activity.outcome === "bid_requested" || activity.outcome === "meeting_scheduled" ? "responded" : "contacted";
  }
  if (activity.type === "inbound_reply") {
    update.chaseState = "responded";
    update.status = "qualified";
  }
  if (cleanString(req.body.nextFollowUpAt)) update.nextFollowUpAt = cleanString(req.body.nextFollowUpAt);
  await subColl.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
  res.status(201).json(activity);
});

app.post("/api/subcontractors/:id/chase-task", async (req, res) => {
  const coll = await collection("subcontractors");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const record = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!record) return res.status(404).json({ error: "Subcontractor not found." });
  const mode = cleanString(req.body.mode || "both");
  if (mode === "docs") return res.json(buildDocsRequestTask(record));
  res.json(buildSubcontractorChaseTask(record, mode));
});

app.get("/api/trade-presets", (_req, res) => {
  res.json(TRADE_PRESETS.map(({ key, label, serviceCategory }) => ({ key, label, serviceCategory })));
});

// ── Job history: log real jobs with a sub and blend into their score ──
app.get("/api/subcontractors/:id/jobs", async (req, res) => {
  const coll = await collection("subcontractorJobs");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({ subcontractorId: req.params.id }).sort({ completedAt: -1 }).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined, score: scoreJob(row) })));
});

app.post("/api/subcontractors/:id/jobs", async (req, res) => {
  const coll = await collection("subcontractorJobs");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const job = { subcontractorId: req.params.id, ...normalizeJob(req.body) };
  const result = await coll.insertOne(job);
  const scores = await recomputeJobScore(req.params.id);
  res.status(201).json({ ...job, id: result.insertedId.toString(), score: scoreJob(job), subcontractorScores: scores });
});

app.delete("/api/subcontractors/:id/jobs/:jobId", async (req, res) => {
  const coll = await collection("subcontractorJobs");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await coll.deleteOne({ _id: new ObjectId(req.params.jobId), subcontractorId: req.params.id });
  const scores = await recomputeJobScore(req.params.id);
  res.json({ deleted: true, subcontractorScores: scores });
});

// ── Audit: how effective is the finder + how healthy is the database ──
const TARGET_TRADES = TRADE_PRESETS.map((preset) => preset.serviceCategory);

app.get("/api/audit", async (_req, res) => {
  const subs = await collection("subcontractors");
  if (!subs) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const [byTrade, scoreBuckets, byStage, byConfidence, byMaterials] = await Promise.all([
    subs.aggregate([{ $group: {
      _id: "$serviceCategory", count: { $sum: 1 },
      avgFit: { $avg: "$fitScore" }, avgOverall: { $avg: { $ifNull: ["$overallScore", "$fitScore"] } },
      withPhone: { $sum: { $cond: [{ $ne: ["$phone", ""] }, 1, 0] } },
      withEmail: { $sum: { $cond: [{ $ne: ["$email", ""] }, 1, 0] } },
      withWebsite: { $sum: { $cond: [{ $ne: ["$website", ""] }, 1, 0] } },
      withOwner: { $sum: { $cond: [{ $ne: ["$ownerName", ""] }, 1, 0] } },
      licenseVerified: { $sum: { $cond: ["$licenseVerified", 1, 0] } },
      withLicenseNum: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$licenseNumber", ""] }, ""] }, 1, 0] } },
      contacted: { $sum: { $cond: [{ $in: [{ $ifNull: ["$outreachStage", "not_contacted"] }, ["contacted", "responded", "pricing_received", "vetted", "preferred"]] }, 1, 0] } },
      jobsLogged: { $sum: { $ifNull: ["$jobCount", 0] } }
    } }, { $sort: { count: -1 } }]).toArray(),
    subs.aggregate([{ $bucket: {
      groupBy: { $ifNull: ["$overallScore", "$fitScore"] },
      boundaries: [0, 40, 55, 70, 85, 101], default: "other",
      output: { count: { $sum: 1 } }
    } }]).toArray(),
    subs.aggregate([{ $group: { _id: { $ifNull: ["$outreachStage", "not_contacted"] }, count: { $sum: 1 } } }]).toArray(),
    subs.aggregate([{ $group: { _id: { $ifNull: ["$sourceConfidence", "unknown"] }, count: { $sum: 1 } } }]).toArray(),
    subs.aggregate([{ $group: { _id: { $ifNull: ["$bringsOwnMaterials", "unknown"] }, count: { $sum: 1 } } }]).toArray()
  ]);

  const total = byTrade.reduce((sum, trade) => sum + trade.count, 0);
  const presentTrades = new Map(byTrade.map((trade) => [cleanString(trade._id).toLowerCase(), trade.count]));
  const gaps = TARGET_TRADES
    .map((trade) => ({ trade, count: presentTrades.get(trade.toLowerCase()) || 0 }))
    .filter((gap) => gap.count < 4)
    .sort((a, b) => a.count - b.count);

  const runsColl = await collection("sourcingRuns");
  let runs = [];
  let skipReasons = [];
  if (runsColl) {
    runs = await runsColl.find({}).sort({ createdAt: -1 }).limit(40).toArray();
    const reasonCounts = new Map();
    for (const run of runs) {
      for (const skip of run.skipped || []) {
        const reason = cleanString(skip.reason).replace(/\d+/g, "#");
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      }
    }
    skipReasons = [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 12);
  }

  const suppliersColl = await collection("suppliers");
  let suppliers = { total: 0, byCategory: [], byStatus: [], withMinSpend: 0, withLeadTime: 0 };
  if (suppliersColl) {
    const [byCategory, byStatus, meta] = await Promise.all([
      suppliersColl.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray(),
      suppliersColl.aggregate([{ $group: { _id: { $ifNull: ["$accountStatus", "not_started"] }, count: { $sum: 1 } } }]).toArray(),
      suppliersColl.aggregate([{ $group: {
        _id: null, total: { $sum: 1 },
        withMinSpend: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$minimumSpend", ""] }, ""] }, 1, 0] } },
        withLeadTime: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$leadTime", ""] }, ""] }, 1, 0] } }
      } }]).toArray()
    ]);
    suppliers = { total: meta[0]?.total || 0, byCategory, byStatus, withMinSpend: meta[0]?.withMinSpend || 0, withLeadTime: meta[0]?.withLeadTime || 0 };
  }

  // Docs/licenses/insurance expiring within 45 days or already expired.
  const allSubs = await subs.find({}, { projection: { companyName: 1, serviceCategory: 1, phone: 1, licenseExpiresAt: 1, insuranceExpiresAt: 1, docChecklist: 1, outreachStage: 1 } }).toArray();
  const expiring = [];
  for (const sub of allSubs) {
    const checks = [
      ["CSLB license", sub.licenseExpiresAt],
      ["Insurance", sub.insuranceExpiresAt],
      ["COI", sub.docChecklist?.coi?.expiresAt],
      ["Workers comp cert", sub.docChecklist?.workersCompCert?.expiresAt]
    ];
    for (const [label, date] of checks) {
      const days = daysUntilDate(date);
      if (days !== null && days <= 45) {
        expiring.push({ id: sub._id.toString(), companyName: sub.companyName, trade: sub.serviceCategory, phone: sub.phone, doc: label, expiresAt: cleanString(date), days });
      }
    }
  }
  expiring.sort((a, b) => a.days - b.days);

  const activities = await collection("subcontractorActivities");
  const jobs = await collection("subcontractorJobs");
  res.json({
    generatedAt: new Date().toISOString(),
    expiring: expiring.slice(0, 50),
    subs: { total, byTrade, scoreBuckets, byStage, byConfidence, byMaterials, gaps },
    finder: {
      runs: runs.map((run) => ({
        runId: run.runId, type: run.type, serviceCategory: run.serviceCategory || run.projectType,
        market: run.market, savedCount: run.savedCount || 0, skippedCount: run.skippedCount || 0,
        candidateCount: run.candidateCount || 0, errorCount: (run.errors || []).length,
        minFitScore: run.minFitScore || 0, durationMs: run.durationMs || null, createdAt: run.createdAt,
        yieldRate: run.candidateCount ? Math.round(((run.savedCount || 0) / run.candidateCount) * 100) : null
      })),
      skipReasons
    },
    suppliers,
    activityCount: activities ? await activities.countDocuments() : 0,
    jobCount: jobs ? await jobs.countDocuments() : 0
  });
});

// ── Research chat: RAG over subs + suppliers + optional live web, answered by
// a locally spawned claude CLI (haiku tier) — same pattern as the oriRM runner.
const { spawn } = require("child_process");

function runClaudeCli(prompt, timeoutMs = 150000, model = "claude-haiku-4-5-20251001") {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--model", model, "--output-format", "text"], {
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

function keywordsFromQuestion(question) {
  const stop = new Set(["should", "would", "could", "from", "with", "that", "this", "what", "which", "where", "their", "there", "about", "them", "have", "does", "were", "will", "your", "ours", "them", "than", "then", "better", "best", "worth", "buying"]);
  return cleanString(question).toLowerCase().split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !/^\d+$/.test(word) && !stop.has(word));
}

async function gatherResearchContext(question) {
  const words = keywordsFromQuestion(question);
  const regexes = words.map((word) => new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  const subsColl = await collection("subcontractors");
  const suppliersColl = await collection("suppliers");
  const lines = [];
  if (subsColl && regexes.length) {
    const subs = await subsColl.find({ $or: [
      { serviceCategory: { $in: regexes } },
      { specialties: { $in: regexes } },
      { companyName: { $in: regexes } },
      { summary: { $in: regexes } }
    ] }).sort({ fitScore: -1 }).limit(12).toArray();
    for (const sub of subs) {
      lines.push(`SUB: ${sub.companyName} | ${sub.serviceCategory} | score ${sub.overallScore || sub.fitScore} | ${sub.phone || "no phone"} | ${sub.email || "no email"} | materials: ${sub.bringsOwnMaterials || "unknown"} | ${sub.priceTier || ""} | ${cleanString(sub.summary).slice(0, 140)}`);
    }
  }
  if (suppliersColl && regexes.length) {
    const sups = await suppliersColl.find({ $or: [
      { category: { $in: regexes } },
      { name: { $in: regexes } },
      { brands: { $in: regexes } },
      { suppliesServices: { $in: regexes } },
      { notes: { $in: regexes } }
    ] }).limit(12).toArray();
    for (const sup of sups) {
      lines.push(`SUPPLIER: ${sup.name} | ${sup.category} | ${sup.accountType} | account: ${sup.accountStatus} | min spend: ${sup.minimumSpend || "unknown"} | lead time: ${sup.leadTime || "unknown"} | ${sup.phone || "no phone"} | ${cleanString(sup.notes).slice(0, 140)}`);
    }
  }
  return lines;
}

app.get("/api/research-chat", async (_req, res) => {
  const coll = await collection("researchChats");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ createdAt: -1 }).limit(50).toArray();
  res.json(rows.reverse().map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/research-chat", async (req, res) => {
  const question = cleanString(req.body.question);
  if (!question) return res.status(400).json({ error: "Provide a question." });
  const useWeb = req.body.useWeb !== false;
  try {
    const internalLines = await gatherResearchContext(question);
    let webLines = [];
    if (useWeb) {
      try {
        const results = await searchWeb(`${question} construction materials sourcing Los Angeles`, 4);
        webLines = results.map((result) => `WEB: ${result.title} | ${result.url} | ${result.snippet}`);
      } catch (error) {
        webLines = [`WEB: search unavailable (${error.message})`];
      }
    }
    const prompt = [
      "You are the sourcing analyst for Joon Development Group, a Los Angeles general contractor.",
      "Answer the question using the INTERNAL CONTEXT (our vetted subcontractor roster and supplier trade accounts) plus the WEB SNIPPETS.",
      "When the question is about buying materials, explicitly weigh the four channels: (1) local wholesale distributor trade account, (2) direct manufacturer/dealer program, (3) big-box pro desk (Home Depot Pro Xtra / Lowe's Pro), (4) let the subcontractor supply materials (check the sub's 'materials:' flag).",
      "Give a clear recommendation first, then reasoning, then concrete next steps with names/phones from context when available. Keep it under 350 words. If context is thin, say what is missing.",
      "",
      "INTERNAL CONTEXT:",
      internalLines.length ? internalLines.join("\n") : "(no matching internal records)",
      "",
      "WEB SNIPPETS:",
      webLines.length ? webLines.join("\n") : "(web disabled)",
      "",
      `QUESTION: ${question}`
    ].join("\n");

    let answer;
    let engine = "claude-haiku";
    try {
      answer = await runClaudeCli(prompt);
    } catch (cliError) {
      engine = "context-only";
      answer = [
        "(Claude CLI unavailable - returning raw research context. CLI error: " + cliError.message + ")",
        "",
        "Internal matches:",
        internalLines.length ? internalLines.join("\n") : "none",
        "",
        "Web results:",
        webLines.join("\n") || "none"
      ].join("\n");
    }

    const coll = await collection("researchChats");
    const doc = { question, answer, engine, internalMatches: internalLines.length, webMatches: webLines.length, createdAt: new Date().toISOString() };
    if (coll) await coll.insertOne(doc);
    res.json(doc);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// ── Estimator: LA cost book + estimates + AI draft ──
const COSTBOOK_PATH = path.join(__dirname, "costbook.json");
let costbookCache = null;
function loadCostbook() {
  if (!costbookCache) costbookCache = JSON.parse(fs.readFileSync(COSTBOOK_PATH, "utf8"));
  return costbookCache;
}

app.get("/api/estimator/costbook", (_req, res) => {
  try {
    costbookCache = null; // always fresh so the file stays hand-editable
    res.json(loadCostbook());
  } catch (error) {
    res.status(500).json({ error: `costbook.json unreadable: ${error.message}` });
  }
});

function normalizeEstimateLine(input) {
  return {
    id: cleanString(input.id || cryptoId()),
    costbookId: cleanString(input.costbookId),
    trade: cleanString(input.trade),
    description: cleanString(input.description),
    qty: Number(input.qty || 1),
    unit: cleanString(input.unit || "job"),
    unitLow: Number(input.unitLow || 0),
    unitHigh: Number(input.unitHigh || 0),
    notes: cleanString(input.notes)
  };
}

// ── Project actuals: real completed-job costs that calibrate the cost book ──
function normalizeActualLine(input) {
  const qty = Number(input.qty || 1) || 1;
  const actualTotal = Number(input.actualTotal || 0);
  return {
    id: cleanString(input.id || cryptoId()),
    costbookId: cleanString(input.costbookId),
    trade: cleanString(input.trade),
    description: cleanString(input.description),
    qty,
    unit: cleanString(input.unit || "job"),
    actualTotal,
    actualUnit: qty ? Math.round((actualTotal / qty) * 100) / 100 : actualTotal,
    subName: cleanString(input.subName),
    notes: cleanString(input.notes)
  };
}

function normalizeActual(input) {
  const lines = Array.isArray(input.lines) ? input.lines.map(normalizeActualLine) : [];
  const actualCost = lines.reduce((sum, line) => sum + line.actualTotal, 0);
  const contractPrice = Number(input.contractPrice || 0);
  const overheadCost = Number(input.overheadCost || 0);
  return {
    projectName: cleanString(input.projectName || "Untitled project"),
    projectType: cleanString(input.projectType),
    city: cleanString(input.city),
    status: pickEnum(input.status, ["active", "completed", "on_hold"], "active"),
    description: cleanString(input.description),
    completedAt: cleanString(input.completedAt || new Date().toISOString().slice(0, 10)),
    sqft: Number(input.sqft || 0),
    contractPrice,
    actualCost: Math.round(actualCost),
    overheadCost: Math.round(overheadCost),
    grossMargin: Math.round(contractPrice - actualCost - overheadCost),
    marginPercent: contractPrice ? Math.round(((contractPrice - actualCost - overheadCost) / contractPrice) * 100) : 0,
    estimateId: cleanString(input.estimateId),
    bidProjectId: cleanString(input.bidProjectId),
    notes: cleanString(input.notes),
    lines,
    updatedAt: new Date().toISOString()
  };
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

// Compare book ranges against observed unit costs; blend weight grows with
// observation count (30%/observation, capped 80%) so one weird job can't
// swing the book, but 3+ real jobs mostly become the book.
async function buildCalibration() {
  const coll = await collection("projectActuals");
  const book = loadCostbook();
  const observations = new Map();
  if (coll) {
    const rows = await coll.find({}).toArray();
    for (const row of rows) {
      for (const line of row.lines || []) {
        if (!line.costbookId || !line.actualUnit) continue;
        if (!observations.has(line.costbookId)) observations.set(line.costbookId, []);
        observations.get(line.costbookId).push({ unit: line.actualUnit, project: row.projectName, at: row.completedAt });
      }
    }
  }
  const rounder = (item) => (item.low >= 100 ? 50 : item.low >= 10 ? 5 : 0.25);
  return book.items.map((item) => {
    const obs = (observations.get(item.id) || []).sort((a, b) => a.unit - b.unit);
    if (!obs.length) return { id: item.id, description: item.description, unit: item.unit, bookLow: item.low, bookHigh: item.high, count: 0, calibration: item.calibration || null };
    const units = obs.map((o) => o.unit);
    const q25 = quantile(units, 0.25);
    const q75 = quantile(units, 0.75);
    const weight = Math.min(0.8, 0.3 * obs.length);
    const step = rounder(item);
    const suggestedLow = Math.round((item.low * (1 - weight) + Math.min(q25, item.low * 1.5) * weight) / step) * step;
    const suggestedHigh = Math.round((item.high * (1 - weight) + Math.max(q75, suggestedLow * 1.1) * weight) / step) * step;
    return {
      id: item.id, description: item.description, unit: item.unit,
      bookLow: item.low, bookHigh: item.high,
      count: obs.length,
      obsMin: units[0], obsMedian: Math.round(quantile(units, 0.5) * 100) / 100, obsMax: units[units.length - 1],
      suggestedLow, suggestedHigh,
      changed: suggestedLow !== item.low || suggestedHigh !== item.high,
      projects: obs.map((o) => o.project).slice(0, 6),
      calibration: item.calibration || null
    };
  });
}

function normalizeEstimate(input) {
  const lines = Array.isArray(input.lines) ? input.lines.map(normalizeEstimateLine) : [];
  return {
    title: cleanString(input.title || "Untitled estimate"),
    clientName: cleanString(input.clientName),
    address: cleanString(input.address),
    projectType: cleanString(input.projectType),
    sqft: Number(input.sqft || 0),
    description: cleanString(input.description),
    lines,
    contingencyPercent: Number(input.contingencyPercent ?? 12),
    markupPercent: Number(input.markupPercent ?? 25),
    status: pickEnum(input.status, ["draft", "sent", "accepted", "dead"], "draft"),
    notes: cleanString(input.notes),
    updatedAt: new Date().toISOString()
  };
}

app.get("/api/estimates", async (_req, res) => {
  const coll = await collection("estimates");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ updatedAt: -1 }).limit(200).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/estimates", async (req, res) => {
  const coll = await collection("estimates");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const doc = { ...normalizeEstimate(req.body), createdAt: new Date().toISOString() };
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.put("/api/estimates/:id", async (req, res) => {
  const coll = await collection("estimates");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const update = normalizeEstimate(req.body);
  await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
  res.json({ ...update, id: req.params.id });
});

app.delete("/api/estimates/:id", async (req, res) => {
  const coll = await collection("estimates");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await coll.deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).end();
});

// Bridge: estimate -> Bid Lab project (line items carry the ranges over).
app.post("/api/estimates/:id/to-bid-project", async (req, res) => {
  const estimates = await collection("estimates");
  const bids = await collection("bidProjects");
  if (!estimates || !bids) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const est = await estimates.findOne({ _id: new ObjectId(req.params.id) });
  if (!est) return res.status(404).json({ error: "Estimate not found." });
  const now = new Date().toISOString();
  const doc = {
    ...normalizeBidProject({
      customerName: est.clientName || est.title,
      projectType: est.projectType,
      city: est.address,
      status: "intake",
      scopeDraft: est.description,
      budgetLow: Math.round((est.lines || []).reduce((sum, line) => sum + line.qty * line.unitLow, 0)),
      budgetHigh: Math.round((est.lines || []).reduce((sum, line) => sum + line.qty * line.unitHigh, 0)),
      contingencyPercent: est.contingencyPercent,
      markupPercent: est.markupPercent,
      lineItems: (est.lines || []).map((line) => ({
        trade: line.trade,
        description: line.description,
        quantity: String(line.qty),
        unit: line.unit,
        lowCost: Math.round(line.qty * line.unitLow),
        highCost: Math.round(line.qty * line.unitHigh)
      }))
    }),
    createdAt: now
  };
  const result = await bids.insertOne(doc);
  res.status(201).json({ bidProjectId: result.insertedId.toString() });
});

app.get("/api/actuals", async (_req, res) => {
  const coll = await collection("projectActuals");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ completedAt: -1 }).limit(300).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/actuals", async (req, res) => {
  const coll = await collection("projectActuals");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const doc = { ...normalizeActual(req.body), createdAt: new Date().toISOString() };
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.put("/api/actuals/:id", async (req, res) => {
  const coll = await collection("projectActuals");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  // Merge onto the stored doc so a partial PUT can't blank unmentioned fields.
  const existing = await coll.findOne({ _id: new ObjectId(req.params.id) });
  const update = normalizeActual(existing ? { ...existing, ...req.body } : req.body);
  await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
  res.json({ ...update, id: req.params.id });
});

app.delete("/api/actuals/:id", async (req, res) => {
  const coll = await collection("projectActuals");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await coll.deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).end();
});

// AI parse: free-text project description -> pre-filled actuals form fields.
app.post("/api/actuals/ai-parse", async (req, res) => {
  const description = cleanString(req.body.description);
  if (!description) return res.status(400).json({ error: "Describe the project first." });
  try {
    const book = loadCostbook();
    const bookLines = book.items.map((item) => `${item.id} | ${item.description} | ${item.unit}`).join("\n");
    const prompt = [
      "You are the bookkeeper for Joon Development Group, a Los Angeles general contractor.",
      "Parse the completed-project description below into a structured cost record.",
      "Rules:",
      "- contractPrice = what the CLIENT paid us in total.",
      "- lines = OUR costs only (sub payments, materials we bought, overhead allocations). Client-supplied materials are NOT cost lines - mention them in notes.",
      "- If the description gives a percentage for overhead/marketing, compute it in dollars as its own line (description 'Marketing & overhead (X%)').",
      "- If one lump sum covers several scopes, split it into sensible lines and say so in each line's notes ('split estimated from $X total').",
      "- Link a line to a cost-book id ONLY when it clearly matches; otherwise costbookId null.",
      "- completedAt: ISO date if stated, else null. qty defaults 1, unit 'job'.",
      "Return STRICT JSON only - no markdown - shaped exactly:",
      '{"projectName":"","projectType":"","city":"","completedAt":null,"sqft":0,"contractPrice":0,"notes":"","assumptions":["..."],"lines":[{"costbookId":null,"description":"","qty":1,"unit":"job","actualTotal":0,"subName":"","notes":""}]}',
      "",
      "COST BOOK IDS (id | description | unit):",
      bookLines,
      "",
      `PROJECT DESCRIPTION: ${description}`
    ].join("\n");
    const raw = await runClaudeCli(prompt, 180000);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model did not return JSON.");
    const parsed = JSON.parse(jsonMatch[0]);
    res.json({
      projectName: cleanString(parsed.projectName),
      projectType: cleanString(parsed.projectType),
      city: cleanString(parsed.city),
      completedAt: cleanString(parsed.completedAt || ""),
      sqft: Number(parsed.sqft || 0),
      contractPrice: Number(parsed.contractPrice || 0),
      notes: cleanString(parsed.notes),
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(cleanString) : [],
      lines: (parsed.lines || []).map(normalizeActualLine)
    });
  } catch (error) {
    res.status(502).json({ error: `AI parse failed: ${error.message}. Fill the form manually.` });
  }
});

// Photos: raw image upload per project, served from /uploads.
const UPLOADS_DIR = path.join(__dirname, "uploads");
crmApp.use("/uploads", express.static(UPLOADS_DIR));

app.post("/api/actuals/:id/photos", express.raw({ type: ["image/*"], limit: "10mb" }), async (req, res) => {
  const coll = await collection("projectActuals");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  if (!req.body || !req.body.length) return res.status(400).json({ error: "No image data received." });
  const record = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!record) return res.status(404).json({ error: "Project not found." });
  const ext = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/gif": ".gif" })[cleanString(req.headers["content-type"]).split(";")[0]] || ".jpg";
  const safeName = cleanString(req.query.name || "photo").replace(/[^a-z0-9._-]/gi, "_").replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
  const file = `${Date.now().toString(36)}-${safeName}${ext}`;
  const dir = path.join(UPLOADS_DIR, "actuals", req.params.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), req.body);
  const photo = { file, url: `/uploads/actuals/${req.params.id}/${file}`, name: safeName, uploadedAt: new Date().toISOString() };
  await coll.updateOne({ _id: record._id }, { $push: { photos: photo }, $set: { updatedAt: new Date().toISOString() } });
  res.status(201).json(photo);
});

app.delete("/api/actuals/:id/photos/:file", async (req, res) => {
  const coll = await collection("projectActuals");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const file = cleanString(req.params.file).replace(/[^a-z0-9._-]/gi, "");
  try { fs.unlinkSync(path.join(UPLOADS_DIR, "actuals", req.params.id, file)); } catch (_error) { /* already gone */ }
  await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $pull: { photos: { file } } });
  res.json({ deleted: file });
});

app.get("/api/estimator/calibration", async (_req, res) => {
  try {
    costbookCache = null;
    res.json({ items: await buildCalibration() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply observed actuals into costbook.json (with a backup written first).
app.post("/api/estimator/calibrate", async (req, res) => {
  try {
    costbookCache = null;
    const ids = Array.isArray(req.body.itemIds) ? req.body.itemIds.map(cleanString) : [];
    if (!ids.length) return res.status(400).json({ error: "Pick at least one item to calibrate." });
    const calibration = await buildCalibration();
    const byId = new Map(calibration.map((c) => [c.id, c]));
    const book = loadCostbook();
    fs.writeFileSync(path.join(__dirname, "costbook.backup.json"), JSON.stringify(book, null, 2));
    const applied = [];
    for (const item of book.items) {
      const cal = byId.get(item.id);
      if (!ids.includes(item.id) || !cal || !cal.count) continue;
      item.low = cal.suggestedLow;
      item.high = cal.suggestedHigh;
      item.calibration = { n: cal.count, appliedAt: new Date().toISOString().slice(0, 10) };
      applied.push({ id: item.id, low: item.low, high: item.high, n: cal.count });
    }
    fs.writeFileSync(COSTBOOK_PATH, JSON.stringify(book, null, 2));
    costbookCache = null;
    res.json({ applied, backup: "costbook.backup.json" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI draft: scope description -> line items grounded in the cost book + our subs' pricing notes.
app.post("/api/estimator/ai-draft", async (req, res) => {
  const description = cleanString(req.body.description);
  if (!description) return res.status(400).json({ error: "Describe the project first." });
  try {
    const book = loadCostbook();
    const bookLines = book.items.map((item) => `${item.id} | ${item.description} | ${item.unit} | ${item.low}-${item.high}`).join("\n");
    const prompt = [
      "You are the estimator for Joon Development Group, a Los Angeles general contractor.",
      "Draft a line-item planning estimate for the project described below.",
      "Use ONLY line items grounded in the COST BOOK where possible (reference by id); you may add custom lines for scope the book lacks, with realistic LA unit ranges.",
      "Quantities must follow from the description (measure, count, infer conservatively).",
      "Return STRICT JSON only - no markdown, no commentary - shaped exactly:",
      '{"lines":[{"costbookId":"kit-demo or null","trade":"","description":"","qty":1,"unit":"job","unitLow":0,"unitHigh":0,"notes":"assumption made"}],"assumptions":["..."],"questions":["what to confirm on walkthrough"]}',
      "",
      "COST BOOK (id | description | unit | low-high $):",
      bookLines,
      "",
      `PROJECT DESCRIPTION: ${description}`,
      req.body.sqft ? `Approx sqft: ${req.body.sqft}` : ""
    ].join("\n");
    const raw = await runClaudeCli(prompt, 180000);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model did not return JSON.");
    const parsed = JSON.parse(jsonMatch[0]);
    const byId = new Map(book.items.map((item) => [item.id, item]));
    const lines = (parsed.lines || []).map((line) => {
      const ref = line.costbookId && byId.get(line.costbookId);
      return normalizeEstimateLine({
        costbookId: ref ? ref.id : "",
        trade: line.trade || (ref && ref.trade) || "",
        description: line.description || (ref && ref.description) || "",
        qty: line.qty,
        unit: line.unit || (ref && ref.unit) || "job",
        unitLow: Number(line.unitLow) || (ref ? ref.low : 0),
        unitHigh: Number(line.unitHigh) || (ref ? ref.high : 0),
        notes: line.notes
      });
    });
    // Convert any percent-of-subtotal lines (e.g. PM fee) into dollars against the other lines.
    const dollarLines = lines.filter((line) => line.unit !== "pct-of-subtotal");
    const base = dollarLines.reduce((acc, line) => ({ low: acc.low + line.qty * line.unitLow, high: acc.high + line.qty * line.unitHigh }), { low: 0, high: 0 });
    for (const line of lines) {
      if (line.unit === "pct-of-subtotal") {
        line.notes = cleanString(`${line.unitLow}-${line.unitHigh}% of subtotal. ${line.notes}`);
        line.unitLow = Math.round(base.low * line.unitLow / 100);
        line.unitHigh = Math.round(base.high * line.unitHigh / 100);
        line.unit = "job";
      }
    }
    res.json({ lines, assumptions: parsed.assumptions || [], questions: parsed.questions || [], engine: "claude-haiku" });
  } catch (error) {
    res.status(502).json({ error: `AI draft failed: ${error.message}. Use a template and edit manually.` });
  }
});

app.post("/api/subcontractors/license-search-missing", async (req, res) => {
  try {
    const coll = await collection("subcontractors");
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const limit = clamp(Number(req.body.limit || 10), 1, 25);
    const serviceCategory = cleanString(req.body.serviceCategory);
    const query = {
      $or: [{ licenseNumber: "" }, { licenseNumber: { $exists: false } }]
    };
    if (serviceCategory) query.serviceCategory = serviceCategory;
    const rows = await coll.find(query).sort({ fitScore: -1, companyName: 1 }).limit(limit).toArray();
    const results = [];
    for (const row of rows) {
      results.push(await enrichLicenseForSubcontractor(row._id.toString()));
    }
    res.json({
      checkedCount: results.length,
      foundCount: results.filter((result) => result.found).length,
      results
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.put("/api/subcontractors/:id", async (req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const existing = await coll.findOne({ _id: new ObjectId(req.params.id) });
  // Merge onto the stored doc before normalizing so a partial PUT body can't
  // blank out fields it didn't mention (normalize() fills absent fields with "").
  const merged = existing ? { ...existing, ...req.body } : req.body;
  const update = { ...normalize(merged), updatedAt: new Date().toISOString() };
  update.overallScore = blendScores(update.fitScore, existing && existing.jobScore, existing && existing.jobCount);
  await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
  res.json({ ...update, id: req.params.id });
});

app.delete("/api/subcontractors/:id", async (req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await coll.deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).end();
});

// ── Vetting layer ──
// Recompute dedupe keys + completeness/legit scores for every record from
// stored data only (no web calls, never touches human-entered fields).
function vettingFieldsFor(doc) {
  const enriched = {
    ...doc,
    reachTier: doc.reachTier || "",
    redFlags: doc.redFlags || [],
    licenseStatus: doc.licenseStatus || "unchecked"
  };
  const legitScore = computeLegitScore(enriched);
  const legitTier = legitTierFor(legitScore, doc.redFlags);
  const nonInstalling = cleanArray(doc.redFlags).some((flag) => /non-installing|supplier|manufacturer|retailer/i.test(flag));
  return {
    nameKey: dedupeNameKey(doc.companyName),
    siteKey: dedupeSiteKey(doc.website),
    phoneKey: dedupePhoneKey(doc.phone),
    completenessScore: computeCompletenessScore(enriched),
    legitScore,
    legitTier,
    // strong = named owner AND email (outreach-ready); weak = some channel; none = dead record
    contactStrength: cleanString(doc.ownerName) && cleanString(doc.email) ? "strong"
      : (cleanString(doc.email) || cleanString(doc.phone)) ? "weak" : "none",
    // Auto-hide junk from the working roster: red-flag tiers, dead sites, and
    // non-installing vendors. trusted always wins; manual hidden also respected.
    hiddenAuto: !doc.trusted && (["flagged", "risky"].includes(legitTier) || doc.websiteAlive === false || nonInstalling)
  };
}

app.post("/api/vetting/recompute", async (_req, res) => {
  try {
    const coll = await collection();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured." });
    const rows = await coll.find({}).toArray();
    const ops = rows.map((row) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: vettingFieldsFor(row) } }
    }));
    for (let i = 0; i < ops.length; i += 500) await coll.bulkWrite(ops.slice(i, i + 500));
    res.json({ recomputed: ops.length });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Website liveness: any HTTP response counts as alive (403/500 still means the
// domain resolves and serves); only network failures / timeouts count as dead.
async function checkWebsiteAlive(url) {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const response = await fetch(target, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (response.status === 405 || response.status === 501) {
      const getResponse = await fetch(target, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
      return getResponse.status < 600;
    }
    return response.status < 600;
  } catch {
    return false;
  }
}

app.post("/api/vetting/website-check", async (req, res) => {
  try {
    const coll = await collection();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured." });
    const limit = clamp(Number(req.body.limit || 300), 1, 3000);
    const force = Boolean(req.body.force);
    const query = { website: { $nin: ["", null] } };
    if (!force) query.websiteAlive = { $in: [null, undefined] };
    const rows = await coll.find(query).limit(limit).toArray();
    const now = new Date().toISOString();
    let alive = 0;
    await mapLimit(rows, 12, async (row) => {
      const isAlive = await checkWebsiteAlive(row.website);
      if (isAlive) alive += 1;
      const patch = vettingFieldsFor({ ...row, websiteAlive: isAlive });
      await coll.updateOne({ _id: row._id }, { $set: { websiteAlive: isAlive, websiteCheckedAt: now, ...patch } });
    });
    res.json({ checked: rows.length, alive, dead: rows.length - alive });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Merge deep-vetting research (agent output). Only provided fields are written;
// scores recompute after merge; record is stamped deep_vetted.
const VETTING_PATCH_FIELDS = [
  "licenseNumber", "licenseClass", "licenseType", "licenseStatus", "licenseExpiresAt",
  "licenseSourceUrl", "licenseVerified", "workersCompStatus", "bondedStatus",
  "reviewRating", "reviewCount", "reviewSource", "sentiment", "websiteAlive",
  "redFlags", "ownerName", "ownerTitle", "email", "phone", "yearsInBusiness"
];
app.post("/api/vetting/apply", async (req, res) => {
  try {
    const coll = await collection();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured." });
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    const now = new Date().toISOString();
    let applied = 0;
    const misses = [];
    for (const patch of records) {
      if (!patch || !patch.id) continue;
      let existing = null;
      try { existing = await coll.findOne({ _id: new ObjectId(String(patch.id)) }); } catch { /* bad id */ }
      if (!existing) { misses.push(patch.id); continue; }
      const update = {};
      for (const field of VETTING_PATCH_FIELDS) {
        if (patch[field] !== undefined && patch[field] !== null && patch[field] !== "") update[field] = patch[field];
      }
      if (patch.vettingNotes) {
        update.vettingNotes = cleanString([existing.vettingNotes, patch.vettingNotes].filter(Boolean).join(" | "));
      }
      if (Array.isArray(patch.sourceUrls) && patch.sourceUrls.length) {
        update.sourceUrls = mergeUrls(existing.sourceUrls || [], patch.sourceUrls);
      }
      update.lastVettedAt = now;
      update.vettingStatus = "deep_vetted";
      update.updatedAt = now;
      const merged = { ...existing, ...update };
      Object.assign(update, vettingFieldsFor(merged));
      await coll.updateOne({ _id: existing._id }, { $set: update });
      applied += 1;
    }
    res.json({ applied, misses });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// ── Aggregates for the unified backend app (app.html) ──
// One call each for the dashboard action-items and the pricing-intelligence
// view; both are read-only rollups over existing collections.
app.get("/api/dashboard", async (_req, res) => {
  try {
    const subsColl = await collection("subcontractors");
    if (!subsColl) return res.status(503).json({ error: "MongoDB is not configured." });
    const [subs, cos, rfqs, leads, actuals, bids, estimates] = await Promise.all([
      subsColl.find({}).project({ companyName: 1, serviceCategory: 1, legitScore: 1, legitTier: 1, contactStrength: 1, vettingStatus: 1, redFlags: 1, docChecklist: 1, licenseExpiresAt: 1, insuranceExpiresAt: 1, outreachStage: 1, hidden: 1, hiddenAuto: 1 }).toArray(),
      (await collection("changeOrders")).find({}).project({ title: 1, projectName: 1, status: 1, total: 1, sentAt: 1 }).toArray(),
      (await collection("rfqs")).find({}).project({ scopeTitle: 1, title: 1, dueDate: 1, recipients: 1, bidProjectId: 1, createdAt: 1 }).toArray(),
      (await collection("customerLeads")).find({}).project({ customerName: 1, projectType: 1, status: 1, priority: 1, estimatedValue: 1, source: 1, createdAt: 1, updatedAt: 1 }).toArray(),
      (await collection("projectActuals")).find({}).project({ projectName: 1, status: 1, lines: 1, updatedAt: 1 }).toArray(),
      (await collection("bidProjects")).find({}).project({ projectName: 1, customerName: 1, status: 1, lineItems: 1, subQuotes: 1, updatedAt: 1 }).toArray(),
      (await collection("estimates")).find({}).project({ projectName: 1, status: 1, total: 1, updatedAt: 1 }).toArray()
    ]);
    const now = Date.now();
    const daysTo = (value) => value ? Math.round((new Date(value).getTime() - now) / 86400000) : null;
    const expiring = [];
    for (const sub of subs) {
      for (const [key, item] of Object.entries(sub.docChecklist || {})) {
        const days = daysTo(item && item.expiresAt);
        if (days !== null && days <= 45) expiring.push({ subId: sub._id.toString(), companyName: sub.companyName, doc: key, expiresAt: item.expiresAt, days });
      }
      const licenseDays = daysTo(sub.licenseExpiresAt);
      if (licenseDays !== null && licenseDays <= 45) expiring.push({ subId: sub._id.toString(), companyName: sub.companyName, doc: "license", expiresAt: sub.licenseExpiresAt, days: licenseDays });
    }
    const openRfqs = rfqs.map((rfq) => {
      const recipients = rfq.recipients || [];
      const responded = recipients.filter((recipient) => ["responded", "declined"].includes(recipient.status)).length;
      return { id: rfq._id.toString(), title: rfq.scopeTitle || rfq.title || "RFQ", dueDate: rfq.dueDate, dueDays: daysTo(rfq.dueDate), responded, total: recipients.length };
    }).filter((rfq) => rfq.responded < rfq.total);
    res.json({
      kpis: {
        // Active roster (junk auto-hidden) — matches what the Subs view shows.
        subs: subs.filter((sub) => !sub.hidden && !sub.hiddenAuto).length,
        strongContacts: subs.filter((sub) => sub.contactStrength === "strong").length,
        verified: subs.filter((sub) => sub.legitTier === "verified").length,
        deepVetted: subs.filter((sub) => sub.vettingStatus === "deep_vetted").length,
        redFlagged: subs.filter((sub) => (sub.redFlags || []).length).length,
        projects: actuals.length,
        openBids: bids.filter((bid) => !/won|lost|closed/i.test(bid.status || "")).length,
        newLeads: leads.filter((lead) => (lead.status || "new") === "new").length,
        pipelineValue: leads.reduce((sum, lead) => sum + (Number(lead.estimatedValue) || 0), 0)
      },
      actionItems: {
        expiringDocs: expiring.sort((a, b) => a.days - b.days).slice(0, 12),
        pendingCOs: cos.filter((co) => co.status === "sent").map((co) => ({ id: co._id.toString(), title: co.title, projectName: co.projectName, total: co.total, sentAt: co.sentAt })),
        openRfqs: openRfqs.slice(0, 12),
        newLeads: leads.filter((lead) => (lead.status || "new") === "new").sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 12).map((lead) => ({ ...lead, id: lead._id.toString(), _id: undefined })),
        flaggedSubs: subs.filter((sub) => (sub.redFlags || []).length && !["rejected"].includes(sub.outreachStage)).slice(0, 12).map((sub) => ({ id: sub._id.toString(), companyName: sub.companyName, serviceCategory: sub.serviceCategory, redFlags: sub.redFlags, legitScore: sub.legitScore }))
      },
      estimates: estimates.slice(-8).map((estimate) => ({ id: estimate._id.toString(), projectName: estimate.projectName, status: estimate.status, total: estimate.total }))
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/pricing-intel", async (_req, res) => {
  try {
    const subsColl = await collection("subcontractors");
    if (!subsColl) return res.status(503).json({ error: "MongoDB is not configured." });
    const book = loadCostbook();
    const [actuals, bids, rfqs, jobs] = await Promise.all([
      (await collection("projectActuals")).find({}).project({ projectName: 1, lines: 1, updatedAt: 1 }).toArray(),
      (await collection("bidProjects")).find({}).project({ projectName: 1, subQuotes: 1 }).toArray(),
      (await collection("rfqs")).find({}).project({ scopeTitle: 1, lineItems: 1, recipients: 1, responses: 1 }).toArray(),
      (await collection("subcontractorJobs")).find({}).project({ subcontractorId: 1, trade: 1, projectName: 1, contractValue: 1, completedAt: 1, score: 1 }).toArray()
    ]);
    // observations per costbook item + per trade
    const byItem = {}; const byTrade = {};
    const push = (obs) => {
      if (!obs.amount) return;
      if (obs.costbookId) (byItem[obs.costbookId] = byItem[obs.costbookId] || []).push(obs);
      if (obs.trade) (byTrade[obs.trade] = byTrade[obs.trade] || []).push(obs);
    };
    for (const actual of actuals) for (const line of actual.lines || []) {
      push({ source: "actual", costbookId: line.costbookId, trade: line.trade, amount: Number(line.actualUnit || line.actualTotal || 0), unit: line.unit, subName: line.subName, project: actual.projectName, at: actual.updatedAt });
    }
    for (const bid of bids) for (const quote of bid.subQuotes || []) {
      const amount = Number(quote.quoteFixed) || (Number(quote.quoteLow) + Number(quote.quoteHigh)) / 2 || 0;
      push({ source: "bid-quote", trade: quote.trade, amount, subName: quote.subcontractorName, subId: quote.subcontractorId, project: bid.projectName, at: quote.receivedAt });
    }
    for (const rfq of rfqs) for (const response of rfq.responses || []) {
      if (Number(response.lumpSum)) push({ source: "rfq", trade: response.trade || "", amount: Number(response.lumpSum), subName: response.companyName || response.name, at: response.submittedAt });
      for (const line of response.lineItems || []) push({ source: "rfq", costbookId: line.costbookId || line.id, trade: response.trade || "", amount: Number(line.price || 0), subName: response.companyName || response.name, at: response.submittedAt });
    }
    for (const job of jobs) push({ source: "job", trade: job.trade, amount: Number(job.contractValue || 0), subId: String(job.subcontractorId || ""), project: job.projectName, at: job.completedAt });
    const stats = (list) => {
      const amounts = list.map((obs) => obs.amount).sort((a, b) => a - b);
      return { count: amounts.length, low: amounts[0], median: amounts[Math.floor(amounts.length / 2)], high: amounts[amounts.length - 1] };
    };
    // Self-learning estimate: start from the researched SoCal benchmark (or the
    // book range when no benchmark exists) and shift toward Ori's own observed
    // quotes as they accumulate. Weight = n/(n+3): 1 quote pulls 25%, 3 pull
    // 50%, 9 pull 75% — the book teaches the street, the street overrides it.
    const blend = (item, observed) => {
      const hasBenchmark = item.benchmark && Number(item.benchmark.lowUSD) > 0;
      const prior = hasBenchmark
        ? { low: Number(item.benchmark.lowUSD), high: Number(item.benchmark.highUSD) }
        : { low: Number(item.low || 0), high: Number(item.high || 0) };
      const priorMid = Math.round((prior.low + prior.high) / 2);
      if (!observed || !observed.count) {
        return { ...prior, mid: priorMid, weight: 0, n: 0, basis: hasBenchmark ? "benchmark" : "book" };
      }
      const w = observed.count / (observed.count + 3);
      return {
        low: Math.round(prior.low * (1 - w) + observed.low * w),
        high: Math.round(prior.high * (1 - w) + observed.high * w),
        mid: Math.round(priorMid * (1 - w) + observed.median * w),
        weight: Math.round(w * 100) / 100,
        n: observed.count,
        basis: hasBenchmark ? "benchmark+observed" : "book+observed"
      };
    };
    res.json({
      updated: book.updated,
      items: (book.items || []).map((item) => {
        const observations = byItem[item.id] || [];
        const observed = observations.length ? { ...stats(observations), samples: observations.slice(-6) } : null;
        return { ...item, observed, blended: blend(item, observed) };
      }),
      trades: Object.fromEntries(Object.entries(byTrade).map(([trade, observations]) => [trade, { ...stats(observations), samples: observations.slice(-10) }]))
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// ── AI quick-add: free text → record draft ──
// Ori types "Mike's plumbing, guy named Mike Torres 818-555-0199, does repipes
// in the Valley, from WhatsApp" and gets a filled record back to confirm.
function extractJsonBlock(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

app.post("/api/subcontractors/ai-parse", async (req, res) => {
  try {
    const text = cleanString(req.body.text);
    if (!text) return res.status(400).json({ error: "text is required" });
    const coll = await collection();
    const trades = coll ? await coll.distinct("serviceCategory") : [];
    const prompt = [
      "Parse this note about a subcontractor into JSON. Fields (omit unknown ones, NEVER invent):",
      '{"companyName":"","serviceCategory":"<closest from list>","ownerName":"","phone":"","email":"","website":"","licenseNumber":"","serviceArea":"","specialties":[],"summary":"<1 sentence>","trusted":<true if it sounds like a personal contact/referral (WhatsApp, friend, worked together)>}',
      `Trade list: ${trades.filter(Boolean).slice(0, 60).join(" | ")}`,
      "Reply with ONLY the JSON.", "", `NOTE: ${text}`
    ].join("\n");
    const draft = extractJsonBlock(await runClaudeCli(prompt, 90000));
    res.json({ draft });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/suppliers/ai-parse", async (req, res) => {
  try {
    const text = cleanString(req.body.text);
    if (!text) return res.status(400).json({ error: "text is required" });
    const prompt = [
      "Parse this note about a construction materials supplier into JSON. Fields (omit unknown, NEVER invent):",
      '{"name":"","category":"","website":"","phone":"","email":"","contactName":"","minSpend":"","leadTime":"","brands":[],"suppliesServices":[],"notes":"<1 sentence>","supplierType":"<manufacturer|wholesaler|retailer|distributor if stated or obvious>"}',
      "Reply with ONLY the JSON.", "", `NOTE: ${text}`
    ].join("\n");
    const draft = extractJsonBlock(await runClaudeCli(prompt, 90000));
    res.json({ draft });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// ── Nightly vetting sweep ──
// Ori: "come up with a schedule that'll get the rest vetted." Runs at night,
// takes the next unvetted strong-contact subs, spawns the local claude CLI
// (sonnet, web tools available in agentic -p mode) to verify CSLB + reviews,
// and applies the results through the same path as the manual waves.
// Runs around the clock every intervalHours (Ori: "started doing that more
// often, it doesn't have to only be at night") — 10 subs every 2h ≈ 120/day.
const VETSWEEP_DEFAULTS = { enabled: true, perRun: 10, runsPerCycle: 1, intervalHours: 2 };

async function getVetsweepState() {
  const coll = await collection("settings");
  if (!coll) return null;
  let doc = await coll.findOne({ _id: "vetsweep" });
  if (!doc) {
    doc = { _id: "vetsweep", ...VETSWEEP_DEFAULTS, lastNight: "", history: [] };
    await coll.insertOne(doc);
  }
  return doc;
}

function buildVetPrompt(batch) {
  return [
    "You are vetting subcontractor records for an LA general contractor. For EACH company below:",
    "1. Fetch https://www.cslb.ca.gov/onlineservices/checklicenseII/LicenseDetail.aspx?LicNum=<licenseNumber> when a number exists, else web-search 'CSLB <company name>' to find one. Confirm name match, status, classification, expiry, workers comp, bond.",
    "2. Search reviews (Yelp/Google/BBB): rating, count, source, sentiment.",
    "3. Red flags only when verified: suspended/expired license, name mismatch, complaint pattern, WC exemption while claiming crews, non-installing vendor (supplier/manufacturer/retailer miscategorized as a sub).",
    "NEVER invent. Omit unverifiable fields. licenseVerified true ONLY on exact CSLB name match.",
    'Reply with ONLY JSON: {"records":[{"id":"","companyName":"","licenseNumber":"","licenseStatus":"active|expired|suspended|revoked|not_found|unchecked","licenseClass":"","licenseExpiresAt":"","licenseSourceUrl":"","licenseVerified":false,"workersCompStatus":"","bondedStatus":"","reviewRating":0,"reviewCount":0,"reviewSource":"","sentiment":"","redFlags":[],"vettingNotes":"[vetsweep] <verdict>","sourceUrls":[]}]} - include EVERY input id.',
    "", "COMPANIES:", JSON.stringify(batch, null, 1)
  ].join("\n");
}

async function applyVettingRecords(coll, records) {
  const now = new Date().toISOString();
  let applied = 0;
  for (const patch of records) {
    if (!patch || !patch.id) continue;
    let existing = null;
    try { existing = await coll.findOne({ _id: new ObjectId(String(patch.id)) }); } catch { continue; }
    if (!existing) continue;
    const update = {};
    for (const field of VETTING_PATCH_FIELDS) {
      if (patch[field] !== undefined && patch[field] !== null && patch[field] !== "") update[field] = patch[field];
    }
    if (patch.vettingNotes) update.vettingNotes = cleanString([existing.vettingNotes, patch.vettingNotes].filter(Boolean).join(" | "));
    if (Array.isArray(patch.sourceUrls) && patch.sourceUrls.length) update.sourceUrls = mergeUrls(existing.sourceUrls || [], patch.sourceUrls);
    update.lastVettedAt = now;
    update.vettingStatus = "deep_vetted";
    update.updatedAt = now;
    Object.assign(update, vettingFieldsFor({ ...existing, ...update }));
    await coll.updateOne({ _id: existing._id }, { $set: update });
    applied += 1;
  }
  return applied;
}

let vetsweepRunning = false;
async function vetsweepTick(force = false) {
  if (vetsweepRunning) return;
  vetsweepRunning = true;
  try {
    const state = await getVetsweepState();
    if (!state || (!state.enabled && !force)) return;
    const intervalMs = Number(state.intervalHours || 2) * 3600000;
    const lastRun = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
    if (!force && Date.now() - lastRun < intervalMs) return;
    const settings = await collection("settings");
    await settings.updateOne({ _id: "vetsweep" }, { $set: { lastRunAt: new Date().toISOString() } });
    const coll = await collection();
    let totalApplied = 0;
    for (let run = 0; run < Number(state.runsPerCycle || state.runsPerNight || 1); run += 1) {
      const batch = await coll.find({
        vettingStatus: { $ne: "deep_vetted" },
        contactStrength: "strong",
        hidden: { $ne: true }
      }).sort({ fitScore: -1 }).limit(Number(state.perRun || 8)).toArray();
      if (!batch.length) break;
      const slim = batch.map((row) => ({
        id: row._id.toString(), companyName: row.companyName, serviceCategory: row.serviceCategory,
        website: row.website, phone: row.phone, licenseNumber: row.licenseNumber, ownerName: row.ownerName
      }));
      try {
        const raw = await runClaudeCli(buildVetPrompt(slim), 900000, "claude-sonnet-5");
        const parsed = extractJsonBlock(raw);
        totalApplied += await applyVettingRecords(coll, parsed.records || []);
      } catch (error) {
        console.error("[vetsweep] run failed:", error.message);
      }
    }
    const entry = { at: new Date().toISOString(), applied: totalApplied };
    await settings.updateOne({ _id: "vetsweep" }, { $push: { history: { $each: [entry], $slice: -60 } } });
    console.log(`[vetsweep] cycle: ${totalApplied} subs deep-vetted`);
  } catch (error) {
    console.error("[vetsweep] tick failed:", error.message);
  } finally {
    vetsweepRunning = false;
  }
}
setInterval(vetsweepTick, 20 * 60000);

app.get("/api/vetsweep", async (_req, res) => {
  try {
    const state = await getVetsweepState();
    const coll = await collection();
    const remaining = coll ? await coll.countDocuments({ vettingStatus: { $ne: "deep_vetted" }, contactStrength: "strong", hidden: { $ne: true } }) : 0;
    const perDay = Math.round(Number(state.perRun || 10) * Number(state.runsPerCycle || 1) * (24 / Number(state.intervalHours || 2)));
    res.json({ ...state, _id: undefined, remaining, perNight: perDay, perDay, daysToClear: perDay ? Math.ceil(remaining / perDay) : null, nightsToClear: perDay ? Math.ceil(remaining / perDay) : null });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/vetsweep", async (req, res) => {
  try {
    const settings = await collection("settings");
    await getVetsweepState();
    const update = {};
    if (typeof req.body.enabled === "boolean") update.enabled = req.body.enabled;
    if (Number(req.body.perRun) >= 1) update.perRun = clamp(Number(req.body.perRun), 1, 24);
    if (Number(req.body.runsPerCycle) >= 1) update.runsPerCycle = clamp(Number(req.body.runsPerCycle), 1, 8);
    if (Number(req.body.intervalHours) >= 1) update.intervalHours = clamp(Number(req.body.intervalHours), 1, 24);
    if (req.body.runNow) update.lastRunAt = "";
    if (Object.keys(update).length) await settings.updateOne({ _id: "vetsweep" }, { $set: update });
    if (req.body.runNow) setImmediate(() => vetsweepTick(true));
    res.json(await getVetsweepState());
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/vetting/summary", async (_req, res) => {
  try {
    const coll = await collection();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured." });
    const [tiers, licenses, stats, top] = await Promise.all([
      coll.aggregate([{ $group: { _id: { $ifNull: ["$legitTier", "unscored"] }, count: { $sum: 1 } } }]).toArray(),
      coll.aggregate([{ $group: { _id: { $ifNull: ["$licenseStatus", "unchecked"] }, count: { $sum: 1 } } }]).toArray(),
      coll.aggregate([{ $group: {
        _id: null,
        avgLegit: { $avg: "$legitScore" }, avgComplete: { $avg: "$completenessScore" },
        deepVetted: { $sum: { $cond: [{ $eq: ["$vettingStatus", "deep_vetted"] }, 1, 0] } },
        websiteAlive: { $sum: { $cond: [{ $eq: ["$websiteAlive", true] }, 1, 0] } },
        websiteDead: { $sum: { $cond: [{ $eq: ["$websiteAlive", false] }, 1, 0] } },
        flagged: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$redFlags", []] } }, 0] }, 1, 0] } },
        total: { $sum: 1 }
      } }]).toArray(),
      coll.find({}).sort({ legitScore: -1, completenessScore: -1 })
        .project({ companyName: 1, serviceCategory: 1, legitScore: 1, legitTier: 1, completenessScore: 1, licenseStatus: 1, reviewRating: 1, reviewCount: 1, sourcingMethod: 1 })
        .limit(25).toArray()
    ]);
    res.json({
      tiers: Object.fromEntries(tiers.map((t) => [t._id, t.count])),
      licenseStatuses: Object.fromEntries(licenses.map((l) => [l._id, l.count])),
      stats: stats[0] || {},
      top: top.map((row) => ({ ...row, id: row._id.toString(), _id: undefined }))
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

function normalizeLead(input) {
  const value = Number(input.estimatedValue || 0);
  const probability = Number(input.probability || 0);
  return {
    customerName: cleanString(input.customerName),
    phone: cleanString(input.phone),
    email: cleanString(input.email).toLowerCase(),
    city: cleanString(input.city),
    projectType: cleanString(input.projectType),
    source: cleanString(input.source),
    sourceUrl: cleanString(input.sourceUrl),
    status: cleanString(input.status || "new"),
    priority: cleanString(input.priority || "medium"),
    estimatedValue: value,
    probability,
    expectedValue: Math.round(value * (probability / 100)),
    nextAction: cleanString(input.nextAction),
    nextActionDate: cleanString(input.nextActionDate),
    summary: cleanString(input.summary),
    notes: cleanString(input.notes),
    sourcingMethod: cleanString(input.sourcingMethod || "manual"),
    sourcingRunId: cleanString(input.sourcingRunId),
    agentStatus: cleanString(input.agentStatus || "needs_review"),
    sourceConfidence: cleanString(input.sourceConfidence || "medium"),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function upsertSourcedLead(coll, input) {
  const doc = normalizeLead(input);
  const existing = await coll.findOne({
    $or: [
      ...(doc.sourceUrl ? [{ sourceUrl: doc.sourceUrl }] : []),
      ...(doc.customerName ? [{ customerName: doc.customerName, projectType: doc.projectType, source: doc.source }] : [])
    ]
  });

  if (existing) {
    const merged = {
      ...doc,
      createdAt: existing.createdAt || doc.createdAt,
      notes: cleanString([existing.notes, doc.notes].filter(Boolean).join(" | ")),
      sourcingMethod: existing.sourcingMethod === "manual" ? "manual" : doc.sourcingMethod
    };
    await coll.updateOne({ _id: existing._id }, { $set: merged });
    return { ...merged, id: existing._id.toString(), updatedExisting: true };
  }

  const result = await coll.insertOne(doc);
  return { ...doc, id: result.insertedId.toString(), updatedExisting: false };
}

function buildLeadQueries(input) {
  const projectType = cleanString(input.projectType || "remodel");
  const market = cleanString(input.market || "Los Angeles CA");
  const intent = cleanString(input.intent || "estimate request");
  return [
    `site:craigslist.org ${projectType} ${market} "${intent}"`,
    `site:nextdoor.com ${projectType} ${market} recommendation contractor`,
    `site:facebook.com/groups ${projectType} ${market} contractor recommendation`,
    `${projectType} ${market} homeowner looking for contractor`,
    `${projectType} ${market} property manager contractor needed`,
    `${projectType} ${market} request estimate contractor`
  ].slice(0, Number(input.queryLimit || 6));
}

function estimateLeadValue(projectType) {
  const lower = cleanString(projectType).toLowerCase();
  if (lower.includes("adu") || lower.includes("addition")) return 160000;
  if (lower.includes("tenant")) return 85000;
  if (lower.includes("full") || lower.includes("renovation")) return 120000;
  if (lower.includes("kitchen")) return 55000;
  if (lower.includes("bath")) return 30000;
  if (lower.includes("roof") || lower.includes("concrete")) return 18000;
  return 25000;
}

async function runCustomerLeadAgent(input) {
  const coll = await collection("customerLeads");
  if (!coll) throw new Error("MongoDB is not configured. Set MONGODB_URI to enable server persistence.");
  const runId = `lead-agent-${Date.now()}`;
  const projectType = cleanString(input.projectType || "Remodel");
  const market = cleanString(input.market || "Los Angeles CA");
  const maxResults = clamp(Number(input.maxResults || 10), 1, 25);
  const queries = buildLeadQueries(input);
  const saved = [];
  const errors = [];
  const seen = new Set();

  for (const query of queries) {
    try {
      const results = await searchWeb(query, Math.ceil(maxResults / queries.length) + 2);
      for (const result of results) {
        const key = result.url.toLowerCase().replace(/\/$/, "");
        if (seen.has(key) || saved.length >= maxResults) continue;
        seen.add(key);
        const value = estimateLeadValue(projectType);
        const sourceType = sourceTypeForUrl(result.url);
        saved.push(await upsertSourcedLead(coll, {
          customerName: companyFromResult(result) || "Research candidate",
          city: market,
          projectType,
          source: sourceType,
          sourceUrl: result.url,
          status: "new",
          priority: sourceType === "Craigslist" ? "high" : "medium",
          estimatedValue: value,
          probability: 15,
          nextAction: "Review source, verify fit, then contact only if the post/source exposes a legitimate outreach path.",
          summary: result.snippet || result.title,
          notes: `Agent run ${runId}. Query: "${query}". Source-backed candidate only; verify before outreach.`,
          sourcingMethod: "agent",
          sourcingRunId: runId,
          agentStatus: "needs_review",
          sourceConfidence: result.snippet ? "medium" : "low"
        }));
      }
    } catch (error) {
      errors.push({ query, error: error.message });
    }
  }

  const runs = await collection("sourcingRuns");
  if (runs) {
    await runs.insertOne({
      runId,
      type: "customer-lead",
      projectType,
      market,
      queries,
      savedCount: saved.length,
      errors,
      createdAt: new Date().toISOString()
    });
  }

  return { runId, projectType, market, queries, savedCount: saved.length, saved, errors };
}

function normalizeTraffic(input) {
  const visits = Number(input.visits || 0);
  const leads = Number(input.leads || 0);
  const calls = Number(input.calls || 0);
  const impressions = Number(input.impressions || 0);
  const clicks = Number(input.clicks || 0);
  const spend = Number(input.spend || 0);
  const keyEvents = Number(input.keyEvents || 0);
  return {
    date: cleanString(input.date || new Date().toISOString().slice(0, 10)),
    channel: cleanString(input.channel || "Website"),
    platform: cleanString(input.platform || input.channel || "Website"),
    campaign: cleanString(input.campaign),
    objective: cleanString(input.objective),
    landingPage: cleanString(input.landingPage),
    utmSource: cleanString(input.utmSource),
    utmMedium: cleanString(input.utmMedium),
    utmCampaign: cleanString(input.utmCampaign),
    impressions,
    clicks,
    visits,
    leads,
    calls,
    spend,
    keyEvents,
    source: cleanString(input.source),
    notes: cleanString(input.notes),
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
    cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : 0,
    conversionRate: visits > 0 ? Number(((leads / visits) * 100).toFixed(1)) : 0,
    callRate: visits > 0 ? Number(((calls / visits) * 100).toFixed(1)) : 0,
    updatedAt: new Date().toISOString()
  };
}

function normalizeBidLineItem(input) {
  return {
    id: cleanString(input.id || cryptoId()),
    trade: cleanString(input.trade),
    description: cleanString(input.description),
    quantity: cleanString(input.quantity),
    unit: cleanString(input.unit),
    allowance: cleanString(input.allowance),
    lowCost: Number(input.lowCost || 0),
    highCost: Number(input.highCost || 0),
    selectedSubcontractorId: cleanString(input.selectedSubcontractorId),
    validationStatus: cleanString(input.validationStatus || "unvalidated"),
    notes: cleanString(input.notes)
  };
}

function normalizeSubQuote(input) {
  return {
    id: cleanString(input.id || cryptoId()),
    subcontractorId: cleanString(input.subcontractorId),
    subcontractorName: cleanString(input.subcontractorName),
    trade: cleanString(input.trade),
    status: cleanString(input.status || "requested"),
    quoteLow: Number(input.quoteLow || 0),
    quoteHigh: Number(input.quoteHigh || 0),
    quoteFixed: Number(input.quoteFixed || 0),
    turnaround: cleanString(input.turnaround),
    exclusions: cleanString(input.exclusions),
    requiredInputs: cleanString(input.requiredInputs),
    confidence: cleanString(input.confidence || "unknown"),
    requestedAt: cleanString(input.requestedAt),
    receivedAt: cleanString(input.receivedAt),
    notes: cleanString(input.notes)
  };
}

function cryptoId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBidProject(input) {
  const lineItems = Array.isArray(input.lineItems) ? input.lineItems.map(normalizeBidLineItem) : [];
  const subQuotes = Array.isArray(input.subQuotes) ? input.subQuotes.map(normalizeSubQuote) : [];
  const internalEstimatedCost = Number(input.internalEstimatedCost || 0);
  const finalProposalAmount = Number(input.finalProposalAmount || 0);
  const actualCost = Number(input.actualCost || 0);
  const budgetLow = Number(input.budgetLow || 0);
  const budgetHigh = Number(input.budgetHigh || 0);
  const contingencyPercent = Number(input.contingencyPercent || 12);
  const markupPercent = Number(input.markupPercent || 25);
  return {
    leadId: cleanString(input.leadId),
    customerName: cleanString(input.customerName),
    projectType: cleanString(input.projectType),
    city: cleanString(input.city),
    neighborhood: cleanString(input.neighborhood),
    propertyType: cleanString(input.propertyType),
    clientBudget: cleanString(input.clientBudget),
    status: cleanString(input.status || "intake"),
    outcome: cleanString(input.outcome || "open"),
    sourceUrl: cleanString(input.sourceUrl),
    walkthroughDate: cleanString(input.walkthroughDate),
    designerStatus: cleanString(input.designerStatus || "not_needed_yet"),
    designerName: cleanString(input.designerName),
    designPackageFee: Number(input.designPackageFee || 0),
    scopeDraft: cleanString(input.scopeDraft),
    photosNotes: cleanString(input.photosNotes),
    mustHaves: cleanString(input.mustHaves),
    niceToHaves: cleanString(input.niceToHaves),
    unknowns: cleanString(input.unknowns),
    budgetLow,
    budgetHigh,
    budgetRangeNotes: cleanString(input.budgetRangeNotes),
    internalEstimatedCost,
    contingencyPercent,
    markupPercent,
    targetGrossMarginPercent: Number(input.targetGrossMarginPercent || 30),
    finalProposalAmount,
    actualCost,
    lostReason: cleanString(input.lostReason),
    lineItems,
    subQuotes,
    fixedBidReady: Boolean(input.fixedBidReady),
    fixedBidReadinessNotes: cleanString(input.fixedBidReadinessNotes),
    nextAction: cleanString(input.nextAction),
    nextActionDate: cleanString(input.nextActionDate),
    updatedAt: new Date().toISOString()
  };
}

function buildScopeDraft(input) {
  const projectType = cleanString(input.projectType || "remodel project");
  const mustHaves = cleanString(input.mustHaves);
  const notes = cleanString(input.photosNotes || input.scopeDraft);
  const unknowns = cleanString(input.unknowns);
  return [
    `Project: ${projectType}`,
    input.city || input.neighborhood ? `Location: ${[input.neighborhood, input.city].filter(Boolean).join(", ")}` : "",
    mustHaves ? `Client must-haves: ${mustHaves}` : "",
    notes ? `Walkthrough/photo notes: ${notes}` : "",
    unknowns ? `Unknowns to validate before fixed bid: ${unknowns}` : "",
    "",
    "Trade package draft:",
    "- Demo/haul-off: confirm existing conditions, access, protection, disposal, and patch-back.",
    "- Carpentry/hardscape/interior finishes: quantify visible work and define material allowances.",
    "- Electrical/plumbing/irrigation/drainage: validate permit/code risk and concealed conditions before fixed price.",
    "- Paint/touch-up/cleanup: include closeout expectations and exclusions.",
    "",
    "Pricing rule: issue a planning range first. Do not issue a fixed bid until major trade packages have sub validation, allowances, exclusions, and change-order rules."
  ].filter((line) => line !== "").join("\n");
}

function buildQuoteRequest(project, trade = "") {
  const scope = cleanString(project.scopeDraft) || buildScopeDraft(project);
  return [
    `Bid validation request - ${trade || project.projectType || "project"}`,
    "",
    `Project: ${project.projectType || "Unknown"}`,
    `Location: ${[project.neighborhood, project.city].filter(Boolean).join(", ") || "Los Angeles area"}`,
    `Client planning range shown: ${project.budgetLow || "?"} - ${project.budgetHigh || "?"}`,
    "",
    "Please reply with a budget range or fixed quote, plus exclusions and what else you need to tighten it within 24-48 hours.",
    "",
    scope,
    "",
    "Required reply format:",
    "1. Budget low / high or fixed quote",
    "2. Included scope",
    "3. Exclusions",
    "4. Needed photos, measurements, drawings, site visit, or selections",
    "5. Earliest start / expected duration",
    "6. Confidence: low, medium, or high"
  ].join("\n");
}

function fixedBidReadiness(project) {
  const items = Array.isArray(project.lineItems) ? project.lineItems : [];
  const quotes = Array.isArray(project.subQuotes) ? project.subQuotes : [];
  const trades = [...new Set(items.map((item) => cleanString(item.trade)).filter(Boolean))];
  const validatedTrades = new Set(quotes.filter((quote) => /received|validated|accepted/i.test(quote.status)).map((quote) => cleanString(quote.trade)).filter(Boolean));
  const missing = [];
  if (!cleanString(project.scopeDraft)) missing.push("written scope");
  if (!items.length) missing.push("trade line items");
  if (!cleanString(project.budgetRangeNotes) && (!project.budgetLow || !project.budgetHigh)) missing.push("client budget range notes");
  if (!quotes.length) missing.push("sub quote requests");
  for (const trade of trades) {
    if (!validatedTrades.has(trade)) missing.push(`${trade} sub validation`);
  }
  if (!items.some((item) => cleanString(item.allowance))) missing.push("material allowances");
  if (!quotes.some((quote) => cleanString(quote.exclusions))) missing.push("sub exclusions");
  return {
    ready: missing.length === 0,
    notes: missing.length ? `Not ready for fixed bid. Missing: ${[...new Set(missing)].join(", ")}.` : "Ready for fixed proposal review: scope, trade packages, validation, allowances, and exclusions are present."
  };
}

app.get("/api/customer-leads", async (_req, res) => {
  const coll = await collection("customerLeads");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ updatedAt: -1, customerName: 1 }).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/customer-leads", async (req, res) => {
  const coll = await collection("customerLeads");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const doc = normalizeLead(req.body);
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.post("/api/customer-leads/agent-search", async (req, res) => {
  try {
    const result = await runCustomerLeadAgent(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.put("/api/customer-leads/:id", async (req, res) => {
  const coll = await collection("customerLeads");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  // Merge onto the stored doc first — normalizeLead blanks absent fields, so a
  // partial PUT body must not wipe the record (same fix as subcontractors PUT).
  const existing = await coll.findOne({ _id: new ObjectId(req.params.id) });
  const update = normalizeLead(existing ? { ...existing, ...req.body } : req.body);
  await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
  res.json({ ...update, id: req.params.id });
});

app.delete("/api/customer-leads/:id", async (req, res) => {
  const coll = await collection("customerLeads");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await coll.deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).end();
});

app.get("/api/traffic", async (_req, res) => {
  const coll = await collection("websiteTraffic");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ date: -1, channel: 1 }).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/traffic", async (req, res) => {
  const coll = await collection("websiteTraffic");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const doc = normalizeTraffic(req.body);
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.get("/api/bid-projects", async (_req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ updatedAt: -1, customerName: 1 }).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/bid-projects", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const now = new Date().toISOString();
  const doc = { ...normalizeBidProject(req.body), createdAt: now };
  const readiness = fixedBidReadiness(doc);
  doc.fixedBidReady = readiness.ready;
  doc.fixedBidReadinessNotes = readiness.notes;
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.put("/api/bid-projects/:id", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const existing = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!existing) return res.status(404).json({ error: "Bid project not found." });
  const update = { ...normalizeBidProject(req.body), createdAt: existing.createdAt || new Date().toISOString() };
  const readiness = fixedBidReadiness(update);
  update.fixedBidReady = readiness.ready;
  update.fixedBidReadinessNotes = readiness.notes;
  await coll.updateOne({ _id: existing._id }, { $set: update });
  res.json({ ...update, id: req.params.id });
});

app.delete("/api/bid-projects/:id", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await coll.deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).end();
});

app.post("/api/bid-projects/:id/scope-draft", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const record = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!record) return res.status(404).json({ error: "Bid project not found." });
  const scopeDraft = buildScopeDraft({ ...record, ...req.body });
  const updated = { ...record, scopeDraft, updatedAt: new Date().toISOString() };
  const readiness = fixedBidReadiness(updated);
  await coll.updateOne({ _id: record._id }, { $set: { scopeDraft, fixedBidReady: readiness.ready, fixedBidReadinessNotes: readiness.notes, updatedAt: updated.updatedAt } });
  res.json({ scopeDraft, fixedBidReady: readiness.ready, fixedBidReadinessNotes: readiness.notes });
});

app.post("/api/bid-projects/:id/quote-request", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const record = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!record) return res.status(404).json({ error: "Bid project not found." });
  res.json({ quoteRequest: buildQuoteRequest(record, cleanString(req.body.trade)) });
});

app.post("/api/bid-projects/:id/sub-quotes", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const record = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!record) return res.status(404).json({ error: "Bid project not found." });
  const subQuotes = [...(Array.isArray(record.subQuotes) ? record.subQuotes : []), normalizeSubQuote(req.body)];
  const updated = { ...record, subQuotes };
  const readiness = fixedBidReadiness(updated);
  await coll.updateOne({ _id: record._id }, { $set: { subQuotes, fixedBidReady: readiness.ready, fixedBidReadinessNotes: readiness.notes, updatedAt: new Date().toISOString() } });
  res.status(201).json({ subQuotes, fixedBidReady: readiness.ready, fixedBidReadinessNotes: readiness.notes });
});

app.post("/api/subcontractors/research-url", async (req, res) => {
  const url = cleanString(req.body.url);
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Provide an http or https URL." });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "JoonSubcontractorFinder/1.0 (+manual research CRM)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const html = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: `Source returned HTTP ${response.status}.` });
    res.json(parseResearchPage(url, html));
  } catch (error) {
    res.status(502).json({ error: `Could not import that public page: ${error.message}` });
  } finally {
    clearTimeout(timeout);
  }
});

// ── Autosweep: adaptive background trade sweeps (Option B scheduler) ──
// Runs the finder on the least-covered trades. Starts hourly; when the search
// engines throttle us (zero candidates / mass engine failures) the interval
// escalates x3 (60m -> 180m -> 540m -> 720m cap) and halves back on success.
const AUTOSWEEP_MIN = 60;
const AUTOSWEEP_MAX = 720;

async function getAutosweepState() {
  const coll = await collection("settings");
  if (!coll) return null;
  let doc = await coll.findOne({ _id: "autosweep" });
  if (!doc) {
    doc = { _id: "autosweep", enabled: true, intervalMinutes: AUTOSWEEP_MIN, nextRunAt: new Date(Date.now() + 5 * 60000).toISOString(), history: [], rotation: 0 };
    await coll.insertOne(doc);
  }
  return doc;
}

async function pickAutosweepTrade(rotation) {
  const subs = await collection("subcontractors");
  const counts = await subs.aggregate([{ $group: { _id: "$serviceCategory", n: { $sum: 1 } } }]).toArray();
  const countMap = new Map(counts.map((c) => [cleanString(c._id).toLowerCase(), c.n]));
  const ranked = TRADE_PRESETS
    .map((preset) => ({ preset, count: countMap.get(preset.serviceCategory.toLowerCase()) || 0 }))
    .sort((a, b) => a.count - b.count);
  const pool = ranked.slice(0, 8); // rotate through the 8 thinnest trades
  return pool[(rotation || 0) % pool.length].preset;
}

let autosweepRunning = false;
async function runAutosweepTick() {
  if (autosweepRunning) return;
  autosweepRunning = true;
  try {
    const coll = await collection("settings");
    if (!coll) return;
    const state = await getAutosweepState();
    if (!state.enabled || new Date(state.nextRunAt).getTime() > Date.now()) return;
    const preset = await pickAutosweepTrade(state.rotation);
    let outcome = "error";
    let result = {};
    try {
      result = await runSubcontractorAgent({ tradeKey: preset.key, maxResults: 6, minFitScore: 45 });
      const engineFails = (result.errors || []).filter((e) => /All search engines failed/i.test(e.error || "")).length;
      const throttled = (result.candidateCount || 0) === 0 || engineFails >= Math.ceil((result.queries || []).length / 2);
      outcome = throttled ? "throttled" : "ok";
    } catch (error) {
      result = { error: error.message };
    }
    let interval = Number(state.intervalMinutes || AUTOSWEEP_MIN);
    interval = outcome === "ok" ? Math.max(AUTOSWEEP_MIN, Math.round(interval / 2)) : Math.min(AUTOSWEEP_MAX, interval * 3);
    const entry = {
      at: new Date().toISOString(),
      trade: preset.serviceCategory,
      outcome,
      saved: result.savedCount || 0,
      candidates: result.candidateCount || 0,
      errors: (result.errors || []).length,
      nextIntervalMinutes: interval
    };
    await coll.updateOne({ _id: "autosweep" }, {
      $set: { intervalMinutes: interval, nextRunAt: new Date(Date.now() + interval * 60000).toISOString(), lastRun: entry, rotation: (state.rotation || 0) + 1 },
      $push: { history: { $each: [entry], $slice: -30 } }
    });
    console.log(`[autosweep] ${preset.serviceCategory}: ${outcome}, saved ${entry.saved}/${entry.candidates}, next in ${interval}min`);
  } catch (error) {
    console.error("[autosweep] tick failed:", error.message);
  } finally {
    autosweepRunning = false;
  }
}
setInterval(runAutosweepTick, 60000);

app.get("/api/autosweep", async (_req, res) => {
  const state = await getAutosweepState();
  if (!state) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  res.json(state);
});

app.post("/api/autosweep", async (req, res) => {
  const coll = await collection("settings");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await getAutosweepState();
  const update = {};
  if (typeof req.body.enabled === "boolean") update.enabled = req.body.enabled;
  if (Number(req.body.intervalMinutes) >= AUTOSWEEP_MIN) update.intervalMinutes = clamp(Number(req.body.intervalMinutes), AUTOSWEEP_MIN, AUTOSWEEP_MAX);
  if (req.body.runNow) update.nextRunAt = new Date().toISOString();
  if (Object.keys(update).length) await coll.updateOne({ _id: "autosweep" }, { $set: update });
  res.json(await getAutosweepState());
});

// Single-port consolidation (2026-07-07): the CRM app is mounted INSIDE the
// public app instead of listening on its own port. Public routes are registered
// first, so "/" stays the marketing homepage; CRM pages + /api live at the same
// origin (http://localhost:4373/subs_database.html etc). NOTE: before exposing
// :4373 on a public domain, the CRM paths need auth or an IP allowlist.
publicApp.use(crmApp);

publicApp.listen(publicPort, () => {
  console.log(`Joon site + CRM running single-port at http://localhost:${publicPort}`);
  console.log(mongoUri ? `Mongo persistence enabled: ${dbName}.subcontractors` : "Mongo persistence disabled. Set MONGODB_URI to enable it.");
  if (process.env.CRM_PORT) console.log("CRM_PORT is set but ignored - the CRM now serves from the public port.");
});
