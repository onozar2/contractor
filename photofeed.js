const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { ObjectId } = require("mongodb");

// Photo Feed module for the Joon subcontractor-finder CRM (CompanyCam-style
// project photo documentation). Factory mirrors suppliers.js:
// - `collection` is the app helper `async (name) => coll|null`.
// - every route returns 503 when Mongo is not configured.
// - :id routes look up documents by ObjectId.
//
// Two routers are exported:
// - module.exports = (collection) => router          -> CRM API at /api/photofeed (:4373)
// - module.exports.publicRouter = (collection) => router -> public gallery at /gallery (:4173)
//
// Photos live on disk under UPLOADS_DIR (same tree the actuals photos use) and
// are served statically at /uploads on the CRM app only. The public gallery
// therefore streams files straight from UPLOADS_DIR itself via a token-gated
// /gallery/:token/photo/* route, so shared galleries never depend on :4373.

const UPLOADS_DIR = path.join(__dirname, "uploads");
const PHASES = ["pre-work", "demo", "rough-in", "inspection", "finish", "final", "other"];
const PHASE_LABELS = {
  "pre-work": "Pre-work", "demo": "Demo", "rough-in": "Rough-in",
  "inspection": "Inspection", "finish": "Finish", "final": "Final", "other": "Other"
};

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanList(value) {
  const parts = Array.isArray(value) ? value.map(cleanString) : cleanString(value).split(/\n|,/).map(cleanString);
  return [...new Set(parts.filter(Boolean))];
}

function pickEnum(value, allowed, fallback) {
  const raw = cleanString(value);
  return allowed.includes(raw) ? raw : fallback;
}

function slugify(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function cleanIsoDate(value, fallback) {
  const raw = cleanString(value);
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function normalizeEntry(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const pair = input.beforeAfterPair && typeof input.beforeAfterPair === "object"
    ? { beforeUrl: cleanString(input.beforeAfterPair.beforeUrl), afterUrl: cleanString(input.beforeAfterPair.afterUrl) }
    : null;
  const projectName = cleanString(input.projectName);
  return {
    projectId: cleanString(input.projectId) || slugify(projectName),
    projectName,
    photoUrl: cleanString(input.photoUrl),
    caption: cleanString(input.caption),
    tags: cleanList(input.tags),
    phase: pickEnum(input.phase, PHASES, "other"),
    takenAt: cleanIsoDate(input.takenAt, new Date().toISOString()),
    beforeAfterPair: pair && (pair.beforeUrl || pair.afterUrl) ? pair : null,
    updatedAt: new Date().toISOString()
  };
}

function mapRow(row) {
  return { ...row, id: row._id.toString(), _id: undefined };
}

function groupByDay(entries) {
  const days = new Map();
  for (const entry of entries) {
    const day = String(entry.takenAt || "").slice(0, 10) || "undated";
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(entry);
  }
  return [...days.entries()].map(([date, dayEntries]) => ({ date, entries: dayEntries }));
}

function reportBundle(projectId, entries, shares) {
  const sorted = [...entries].sort((a, b) => String(a.takenAt).localeCompare(String(b.takenAt)));
  const byPhase = {};
  for (const entry of sorted) byPhase[entry.phase] = (byPhase[entry.phase] || 0) + 1;
  return {
    projectId,
    projectName: sorted.length ? sorted[sorted.length - 1].projectName : projectId,
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: sorted.length ? sorted[0].takenAt : null,
      to: sorted.length ? sorted[sorted.length - 1].takenAt : null
    },
    totals: {
      photos: sorted.length,
      days: new Set(sorted.map((entry) => String(entry.takenAt).slice(0, 10))).size,
      beforeAfterPairs: sorted.filter((entry) => entry.beforeAfterPair).length,
      byPhase
    },
    activeShares: shares.length,
    days: groupByDay(sorted)
  };
}

// ── Brand lookup for the public gallery header (same file server.js reads) ──
let brandCache = null;
function galleryBrand() {
  if (brandCache) return brandCache;
  const slug = String(process.env.BRAND || "joon").replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "brands", slug, "brand.json"), "utf8"));
    brandCache = {
      companyName: cleanString(raw.companyName) || "Joon Development Group",
      tagline: cleanString(raw.tagline),
      licenseText: cleanString(raw.licenseShort || raw.licenseText),
      phone: cleanString(raw.phone)
    };
  } catch (_error) {
    brandCache = { companyName: "Joon Development Group", tagline: "", licenseText: "", phone: "" };
  }
  return brandCache;
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ── CRM API router ──
module.exports = function createPhotoFeedRouter(collection) {
  const router = express.Router();
  const noDb = { error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." };

  async function photoLog() {
    return collection("photoLog");
  }

  async function photoShares() {
    return collection("photoShares");
  }

  function publicGalleryBase(req) {
    if (process.env.PUBLIC_GALLERY_URL) return String(process.env.PUBLIC_GALLERY_URL).replace(/\/+$/, "");
    const publicPort = process.env.PUBLIC_PORT || process.env.PORT || 4173;
    return `${req.protocol}://${req.hostname}:${publicPort}`;
  }

  // Chronological feed, optionally scoped to one project.
  router.get("/", async (req, res) => {
    const coll = await photoLog();
    if (!coll) return res.status(503).json(noDb);
    const filter = cleanString(req.query.projectId) ? { projectId: cleanString(req.query.projectId) } : {};
    const rows = await coll.find(filter).sort({ takenAt: 1, createdAt: 1 }).limit(2000).toArray();
    res.json(rows.map(mapRow));
  });

  router.post("/", async (req, res) => {
    const coll = await photoLog();
    if (!coll) return res.status(503).json(noDb);
    const doc = { ...normalizeEntry(req.body), createdAt: new Date().toISOString() };
    if (!doc.projectId) return res.status(400).json({ error: "projectId or projectName is required." });
    if (!doc.photoUrl && !doc.beforeAfterPair) return res.status(400).json({ error: "Provide a photoUrl (an existing /uploads path) or a beforeAfterPair." });
    const result = await coll.insertOne(doc);
    res.status(201).json({ ...doc, id: result.insertedId.toString() });
  });

  // Raw image upload (same zero-dependency pattern as /api/actuals/:id/photos).
  // Returns the /uploads URL to reference from feed entries.
  router.post("/upload", express.raw({ type: ["image/*"], limit: "10mb" }), async (req, res) => {
    if (!req.body || !req.body.length) return res.status(400).json({ error: "No image data received." });
    const projectId = slugify(req.query.projectId) || "misc";
    const ext = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/gif": ".gif" })[cleanString(req.headers["content-type"]).split(";")[0]] || ".jpg";
    const safeName = cleanString(req.query.name || "photo").replace(/[^a-z0-9._-]/gi, "_").replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
    const file = `${Date.now().toString(36)}-${safeName}${ext}`;
    const dir = path.join(UPLOADS_DIR, "photofeed", projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), req.body);
    res.status(201).json({ file, url: `/uploads/photofeed/${projectId}/${file}`, name: safeName, uploadedAt: new Date().toISOString() });
  });

  // Printable-report JSON bundle for one project.
  router.get("/report/:projectId", async (req, res) => {
    const coll = await photoLog();
    const shares = await photoShares();
    if (!coll || !shares) return res.status(503).json(noDb);
    const projectId = cleanString(req.params.projectId);
    const rows = (await coll.find({ projectId }).sort({ takenAt: 1 }).toArray()).map(mapRow);
    if (!rows.length) return res.status(404).json({ error: "No photos logged for that project yet." });
    const activeShares = await shares.find({ projectId, active: true }).toArray();
    res.json(reportBundle(projectId, rows, activeShares));
  });

  // Feed grouped by day (the timeline view).
  router.get("/timeline/:projectId", async (req, res) => {
    const coll = await photoLog();
    if (!coll) return res.status(503).json(noDb);
    const projectId = cleanString(req.params.projectId);
    const rows = (await coll.find({ projectId }).sort({ takenAt: 1, createdAt: 1 }).toArray()).map(mapRow);
    res.json({ projectId, days: groupByDay(rows) });
  });

  // Mint (or reuse) a public share token for a project's gallery.
  router.post("/share/:projectId", async (req, res) => {
    const coll = await photoLog();
    const shares = await photoShares();
    if (!coll || !shares) return res.status(503).json(noDb);
    const projectId = cleanString(req.params.projectId);
    const latest = await coll.find({ projectId }).sort({ takenAt: -1 }).limit(1).toArray();
    if (!latest.length) return res.status(404).json({ error: "Add at least one photo before sharing." });
    let share = await shares.findOne({ projectId, active: true });
    if (!share) {
      share = {
        token: crypto.randomBytes(18).toString("hex"),
        projectId,
        projectName: latest[0].projectName || projectId,
        createdAt: new Date().toISOString(),
        active: true
      };
      await shares.insertOne(share);
    }
    res.status(201).json({
      token: share.token,
      projectId,
      projectName: share.projectName,
      url: `${publicGalleryBase(req)}/gallery/${share.token}`
    });
  });

  // Active share links (feeds the "share links active" metric card).
  router.get("/shares", async (req, res) => {
    const shares = await photoShares();
    if (!shares) return res.status(503).json(noDb);
    const rows = await shares.find({ active: true }).sort({ createdAt: -1 }).toArray();
    res.json(rows.map((row) => ({
      ...mapRow(row),
      url: `${publicGalleryBase(req)}/gallery/${row.token}`
    })));
  });

  // Revoke a share link.
  router.delete("/shares/:token", async (req, res) => {
    const shares = await photoShares();
    if (!shares) return res.status(503).json(noDb);
    await shares.updateOne({ token: cleanString(req.params.token) }, { $set: { active: false, revokedAt: new Date().toISOString() } });
    res.status(204).end();
  });

  router.put("/:id", async (req, res) => {
    const coll = await photoLog();
    if (!coll) return res.status(503).json(noDb);
    const update = normalizeEntry(req.body);
    await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ ...update, id: req.params.id });
  });

  router.delete("/:id", async (req, res) => {
    const coll = await photoLog();
    if (!coll) return res.status(503).json(noDb);
    await coll.deleteOne({ _id: new ObjectId(req.params.id) });
    res.status(204).end();
  });

  return router;
};

// ── Public gallery router (mounted on the :4173 public site at /gallery) ──
module.exports.publicRouter = function createPublicGalleryRouter(collection) {
  const router = express.Router();

  async function findShare(token) {
    const shares = await collection("photoShares");
    if (!shares) return null;
    const clean = cleanString(token).replace(/[^a-f0-9]/gi, "");
    if (!clean) return null;
    return shares.findOne({ token: clean, active: true });
  }

  // Uploads are only mounted statically on the CRM app, so the gallery
  // rewrites /uploads/... photo paths onto this token-gated file route.
  function publicPhotoUrl(baseUrl, token, url) {
    const clean = cleanString(url);
    if (!clean) return "";
    if (/^https?:\/\//i.test(clean)) return clean;
    if (clean.startsWith("/uploads/")) return `${baseUrl}/${token}/photo/${clean.slice("/uploads/".length)}`;
    return clean;
  }

  function notFoundPage(res) {
    res.status(404).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>Gallery not found | ${esc(galleryBrand().companyName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; display: grid; place-items: center; background: #eef2f6; color: #172033; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; padding: 1.5rem; }
    .card { background: #fff; border: 1px solid #d8dee8; border-radius: 12px; padding: 2rem; max-width: 420px; text-align: center; box-shadow: 0 14px 36px rgba(16, 24, 40, 0.08); }
    h1 { font-size: 1.15rem; margin-bottom: 0.5rem; }
    p { color: #687587; font-size: 0.9rem; }
    .brand { margin-top: 1.2rem; font-size: 0.78rem; font-weight: 800; color: #3c4658; }
  </style>
</head>
<body>
  <div class="card">
    <h1>This gallery link is no longer available</h1>
    <p>The link may have expired or been turned off. Please ask your project contact for a fresh link.</p>
    <div class="brand">${esc(galleryBrand().companyName)}</div>
  </div>
</body>
</html>`);
  }

  function renderEntry(baseUrl, token, entry) {
    const phase = PHASE_LABELS[entry.phase] || "Other";
    const time = entry.takenAt ? new Date(entry.takenAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
    const tags = (entry.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("");
    const pair = entry.beforeAfterPair;
    const media = pair
      ? `<div class="pair">
          <figure><span class="pairlabel">Before</span><img src="${esc(publicPhotoUrl(baseUrl, token, pair.beforeUrl))}" alt="Before" loading="lazy" /></figure>
          <figure><span class="pairlabel after">After</span><img src="${esc(publicPhotoUrl(baseUrl, token, pair.afterUrl))}" alt="After" loading="lazy" /></figure>
        </div>`
      : `<img class="photo" src="${esc(publicPhotoUrl(baseUrl, token, entry.photoUrl))}" alt="${esc(entry.caption || "Project photo")}" loading="lazy" />`;
    return `<article class="entry">
      ${media}
      <div class="meta">
        <span class="phase p-${esc(entry.phase)}">${esc(phase)}</span>
        <span class="time">${esc(time)}</span>
      </div>
      ${entry.caption ? `<p class="caption">${esc(entry.caption)}</p>` : ""}
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </article>`;
  }

  router.get("/:token", async (req, res) => {
    let share;
    try {
      share = await findShare(req.params.token);
    } catch (_error) {
      share = null;
    }
    if (!share) return notFoundPage(res);
    const coll = await collection("photoLog");
    const rows = coll
      ? (await coll.find({ projectId: share.projectId }).sort({ takenAt: 1, createdAt: 1 }).toArray()).map(mapRow)
      : [];
    const brand = galleryBrand();
    const days = groupByDay(rows);
    const pairs = rows.filter((entry) => entry.beforeAfterPair);
    const from = rows.length ? String(rows[0].takenAt).slice(0, 10) : "";
    const to = rows.length ? String(rows[rows.length - 1].takenAt).slice(0, 10) : "";
    const fmtDay = (day) => day === "undated" ? "Undated" : new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const daysHtml = days.map((day) => `
      <section class="day">
        <h2>${esc(fmtDay(day.date))} <span class="count">${day.entries.length} photo${day.entries.length === 1 ? "" : "s"}</span></h2>
        <div class="grid">${day.entries.map((entry) => renderEntry(req.baseUrl, share.token, entry)).join("")}</div>
      </section>`).join("");
    res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>${esc(share.projectName)} · Progress Gallery | ${esc(brand.companyName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --ink: #172033; --steel: #3c4658; --muted: #687587; --line: #d8dee8; --soft: #f5f7fa; --blue: #2563eb; --charcoal: #101828; }
    body { background: #eef2f6; color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.45; }
    header { background: var(--charcoal); color: #fff; padding: 1.6rem 5vw 1.4rem; }
    header .brand { font-size: 0.78rem; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.72); }
    header h1 { font-size: 1.35rem; margin-top: 0.3rem; }
    header .sub { color: rgba(255,255,255,0.66); font-size: 0.85rem; margin-top: 0.25rem; }
    .stats { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0.9rem 5vw 0; }
    .stat { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 0.5rem 0.85rem; font-size: 0.78rem; color: var(--muted); font-weight: 700; }
    .stat b { display: block; color: var(--ink); font-size: 1.1rem; }
    main { padding: 1rem 5vw 3rem; display: grid; gap: 1.4rem; max-width: 1100px; margin: 0 auto; width: 100%; }
    .day h2 { font-size: 0.95rem; padding-bottom: 0.4rem; border-bottom: 2px solid var(--line); margin-bottom: 0.7rem; }
    .day .count { color: var(--muted); font-weight: 700; font-size: 0.75rem; margin-left: 0.4rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 0.8rem; }
    .entry { background: #fff; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: 0 14px 36px rgba(16, 24, 40, 0.06); }
    .photo { display: block; width: 100%; height: 240px; object-fit: cover; background: var(--soft); }
    .pair { display: grid; grid-template-columns: 1fr 1fr; }
    .pair figure { position: relative; }
    .pair img { display: block; width: 100%; height: 240px; object-fit: cover; background: var(--soft); }
    .pairlabel { position: absolute; top: 0.5rem; left: 0.5rem; background: rgba(16,24,40,0.78); color: #fff; font-size: 0.66rem; font-weight: 850; text-transform: uppercase; letter-spacing: 0.08em; padding: 0.15rem 0.5rem; border-radius: 999px; }
    .pairlabel.after { background: var(--blue); }
    .meta { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.55rem 0.75rem 0; }
    .phase { display: inline-block; border-radius: 999px; padding: 0.08rem 0.55rem; font-size: 0.68rem; font-weight: 850; background: var(--soft); color: var(--steel); border: 1px solid var(--line); }
    .p-demo { background: #fdecea; color: #b42318; border-color: #f5c9c4; }
    .p-rough-in { background: #fdf3e7; color: #b45309; border-color: #f3ddc0; }
    .p-inspection { background: #f3ecfe; color: #7c3aed; border-color: #ded0f7; }
    .p-finish, .p-final { background: #e7f6f4; color: #0f766e; border-color: #bfe6e1; }
    .time { color: var(--muted); font-size: 0.72rem; font-weight: 700; }
    .caption { padding: 0.4rem 0.75rem 0; font-size: 0.86rem; }
    .tags { display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0.45rem 0.75rem 0.7rem; }
    .entry > :last-child { padding-bottom: 0.7rem; }
    .tag { font-size: 0.68rem; font-weight: 800; color: var(--muted); background: var(--soft); border: 1px solid var(--line); border-radius: 999px; padding: 0.05rem 0.5rem; }
    .empty { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 2.5rem 1rem; text-align: center; color: var(--muted); }
    footer { padding: 1.5rem 5vw 2.5rem; text-align: center; color: var(--muted); font-size: 0.78rem; }
    footer b { color: var(--steel); }
    @media (max-width: 560px) { .pair { grid-template-columns: 1fr; } .photo, .pair img { height: 210px; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">${esc(brand.companyName)}</div>
    <h1>${esc(share.projectName)} — Progress Gallery</h1>
    <div class="sub">${esc(brand.tagline)}${from ? ` · Documented ${esc(from)}${to && to !== from ? ` to ${esc(to)}` : ""}` : ""}</div>
  </header>
  <div class="stats">
    <div class="stat"><b>${rows.length}</b>Photos</div>
    <div class="stat"><b>${days.length}</b>Days on site</div>
    <div class="stat"><b>${pairs.length}</b>Before / after pairs</div>
  </div>
  <main>
    ${daysHtml || '<div class="empty">Photos are on the way — check back soon.</div>'}
  </main>
  <footer>
    <b>${esc(brand.companyName)}</b>${brand.licenseText ? ` · ${esc(brand.licenseText)}` : ""}${brand.phone ? ` · ${esc(brand.phone)}` : ""}
  </footer>
</body>
</html>`);
  });

  // Token-gated photo bytes, streamed straight from UPLOADS_DIR (which is only
  // statically mounted on the CRM port).
  router.get("/:token/photo/*", async (req, res) => {
    let share;
    try {
      share = await findShare(req.params.token);
    } catch (_error) {
      share = null;
    }
    if (!share) return res.status(404).type("text").send("Not found");
    let rel;
    try {
      rel = decodeURIComponent(req.params[0] || "");
    } catch (_error) {
      return res.status(400).type("text").send("Bad path");
    }
    const filePath = path.normalize(path.join(UPLOADS_DIR, rel));
    if (!filePath.startsWith(UPLOADS_DIR + path.sep)) return res.status(400).type("text").send("Bad path");
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return res.status(404).type("text").send("Not found");
    res.sendFile(filePath);
  });

  router.use((_req, res) => notFoundPage(res));

  return router;
};

module.exports.PHASES = PHASES;

// MOUNT (CRM, :4373):    crmApp.use("/api/photofeed", require("./photofeed")(collection));
//                        crmApp.get("/photo_feed.html", (_req, res) => res.sendFile(path.join(__dirname, "photo_feed.html")));
// MOUNT (public, :4173): publicApp.use("/gallery", require("./photofeed").publicRouter(collection));
