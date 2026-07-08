const express = require("express");
const crypto = require("crypto");
const { ObjectId } = require("mongodb");

// Change orders ("variations") module for the Joon contractor app.
// Factory mirrors suppliers.js:
// - `collection` is the app helper `async (name) => coll|null`.
// - every route returns 503 when `collection("changeOrders")` is null.
// - :id routes look up documents by ObjectId.
// Two routers ship from this file:
// - module.exports(collection)              -> CRM router  (mount at /api/changeorders on :4373)
// - module.exports.publicRouter(collection) -> approval router (mount at /co on :4373)

const STATUSES = ["draft", "sent", "approved", "declined", "void"];
const MONGO_ERROR = "MongoDB is not configured. Set MONGODB_URI to enable server persistence.";
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || `http://localhost:${process.env.PUBLIC_PORT || process.env.PORT || 4373}`;

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pickEnum(value, allowed, fallback) {
  const raw = cleanString(value).toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeLineItem(input) {
  const qty = Number(input.qty || 1) || 1;
  const unitCost = round2(input.unitCost);
  return {
    description: cleanString(input.description),
    qty,
    unit: cleanString(input.unit || "ea"),
    unitCost,
    total: round2(qty * unitCost)
  };
}

// Subtotal/markup/total are always recomputed server-side from the line items;
// whatever the client sends for those fields is ignored.
function normalizeChangeOrder(input) {
  const lineItems = (Array.isArray(input.lineItems) ? input.lineItems : [])
    .map(normalizeLineItem)
    .filter((line) => line.description || line.total);
  const subtotal = round2(lineItems.reduce((sum, line) => sum + line.total, 0));
  const markupPct = round2(input.markupPct);
  return {
    projectId: cleanString(input.projectId),
    projectName: cleanString(input.projectName),
    title: cleanString(input.title || "Untitled change order"),
    description: cleanString(input.description),
    reason: cleanString(input.reason),
    lineItems,
    subtotal,
    markupPct,
    total: round2(subtotal * (1 + markupPct / 100)),
    daysImpact: Math.round(Number(input.daysImpact || 0)) || 0,
    status: pickEnum(input.status, STATUSES, "draft"),
    clientName: cleanString(input.clientName),
    clientEmail: cleanString(input.clientEmail).toLowerCase(),
    updatedAt: new Date().toISOString()
  };
}

function publicShape(row) {
  return { ...row, id: row._id.toString(), _id: undefined };
}

// ── CRM router (mount on the :4373 app at /api/changeorders) ──
module.exports = function createChangeOrdersRouter(collection) {
  const router = express.Router();

  async function changeOrders() {
    return collection("changeOrders");
  }

  router.get("/", async (req, res) => {
    const coll = await changeOrders();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    const query = {};
    if (cleanString(req.query.projectId)) query.projectId = cleanString(req.query.projectId);
    if (cleanString(req.query.status)) query.status = pickEnum(req.query.status, STATUSES, "draft");
    const rows = await coll.find(query).sort({ createdAt: -1 }).limit(500).toArray();
    res.json(rows.map(publicShape));
  });

  router.post("/", async (req, res) => {
    const coll = await changeOrders();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    const doc = { ...normalizeChangeOrder(req.body), status: "draft", createdAt: new Date().toISOString() };
    const result = await coll.insertOne(doc);
    res.status(201).json({ ...doc, id: result.insertedId.toString() });
  });

  router.put("/:id", async (req, res) => {
    const coll = await changeOrders();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    let _id;
    try { _id = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid change order id." }); }
    const existing = await coll.findOne({ _id });
    if (!existing) return res.status(404).json({ error: "Change order not found." });
    // Approval bookkeeping (token, timestamps, signature) is never editable via PUT.
    const update = normalizeChangeOrder(req.body);
    if (["approved", "declined"].includes(existing.status) && !["void", existing.status].includes(update.status)) {
      return res.status(409).json({ error: `This change order is already ${existing.status}. It can only be voided.` });
    }
    await coll.updateOne({ _id }, { $set: update });
    res.json({ ...existing, ...update, id: req.params.id, _id: undefined });
  });

  router.delete("/:id", async (req, res) => {
    const coll = await changeOrders();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    let _id;
    try { _id = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid change order id." }); }
    await coll.deleteOne({ _id });
    res.status(204).end();
  });

  // Generate (or reuse) an unguessable approval token and hand back the public URL.
  router.post("/:id/send", async (req, res) => {
    const coll = await changeOrders();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    let _id;
    try { _id = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid change order id." }); }
    const co = await coll.findOne({ _id });
    if (!co) return res.status(404).json({ error: "Change order not found." });
    if (co.status === "approved") return res.status(409).json({ error: "This change order is already approved." });
    if (co.status === "void") return res.status(409).json({ error: "This change order is void. Duplicate it as a new draft to resend." });
    const now = new Date().toISOString();
    const approvalToken = co.approvalToken || crypto.randomBytes(24).toString("hex");
    await coll.updateOne({ _id }, { $set: { approvalToken, status: "sent", sentAt: now, updatedAt: now } });
    res.json({
      id: req.params.id,
      status: "sent",
      sentAt: now,
      approvalToken,
      approvalUrl: `${PUBLIC_ORIGIN}/co/${approvalToken}`
    });
  });

  return router;
};

// ── Public approval page (mount on the :4373 app at /co) ──

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(value) {
  return "$" + (Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function pageShell(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${esc(title)} | Joon Development Group</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --ink: #172033; --steel: #3c4658; --muted: #687587; --line: #d8dee8; --soft: #f5f7fa; --blue: #2563eb; --green: #0f766e; --red: #b42318; }
    body { color: var(--ink); background: #eef2f6; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.5; padding: 1.2rem 4vw 3rem; }
    .sheet { width: min(760px, 100%); margin: 0 auto; background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 14px 36px rgba(16,24,40,0.08); overflow: hidden; }
    .brandbar { background: #101828; color: #fff; padding: 1rem 1.4rem; display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
    .brandbar strong { font-size: 1.02rem; letter-spacing: 0.02em; }
    .brandbar span { color: rgba(255,255,255,0.72); font-size: 0.78rem; }
    .accent { height: 4px; background: var(--blue); }
    .inner { padding: 1.4rem; display: grid; gap: 1.1rem; }
    .eyebrow { color: var(--blue); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
    h1 { font-size: 1.35rem; line-height: 1.25; }
    .meta { color: var(--muted); font-size: 0.84rem; }
    .block { border: 1px solid var(--line); border-radius: 10px; padding: 0.85rem 1rem; }
    .block h2 { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 0.4rem; }
    .block p { font-size: 0.92rem; color: var(--steel); }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th { text-align: left; padding: 0.45rem 0.5rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); border-bottom: 1px solid var(--line); background: var(--soft); }
    td { padding: 0.5rem; border-bottom: 1px solid #eef1f6; vertical-align: top; }
    th.num, td.num { text-align: right; white-space: nowrap; }
    .totals { display: grid; gap: 0.25rem; justify-items: end; font-size: 0.92rem; }
    .totals .grand { font-size: 1.2rem; font-weight: 800; color: var(--blue); }
    .impact { background: #eff4ff; border: 1px solid #c7d7fb; border-radius: 10px; padding: 0.7rem 1rem; font-size: 0.9rem; color: var(--steel); }
    .impact b { color: var(--ink); }
    .sign { display: grid; gap: 0.6rem; }
    .sign label { font-size: 0.78rem; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; display: grid; gap: 0.25rem; }
    .sign input { min-height: 42px; border: 1px solid var(--line); border-radius: 8px; padding: 0 0.7rem; font: inherit; font-size: 1rem; background: var(--soft); width: 100%; }
    .sign input:focus { outline: 2px solid var(--blue); outline-offset: 1px; background: #fff; }
    .btnrow { display: flex; gap: 0.6rem; flex-wrap: wrap; }
    button { min-height: 44px; border-radius: 8px; padding: 0 1.3rem; font: inherit; font-size: 0.95rem; font-weight: 800; cursor: pointer; border: 1px solid var(--line); background: #fff; color: var(--steel); }
    button.approve { background: var(--blue); border-color: var(--blue); color: #fff; flex: 1 1 200px; }
    button.approve:hover { background: #1d4fd7; }
    button.decline:hover { color: var(--red); border-color: var(--red); }
    button:disabled { opacity: 0.55; cursor: wait; }
    .note { color: var(--muted); font-size: 0.78rem; }
    .state { text-align: center; padding: 1.6rem 1rem; display: grid; gap: 0.5rem; justify-items: center; }
    .state .badge { width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; font-size: 1.5rem; color: #fff; background: var(--blue); }
    .state .badge.green { background: var(--green); }
    .state .badge.red { background: var(--red); }
    .state h2 { font-size: 1.15rem; }
    .state p { color: var(--muted); font-size: 0.9rem; max-width: 46ch; }
    .error { color: var(--red); font-size: 0.86rem; min-height: 1.2rem; }
    footer { text-align: center; color: var(--muted); font-size: 0.76rem; margin-top: 1rem; }
    @media print { body { background: #fff; padding: 0; } .sheet { border: none; box-shadow: none; } .btnrow, .sign { display: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brandbar"><strong>JOON DEVELOPMENT GROUP</strong><span>Southern California General Contractor</span></div>
    <div class="accent"></div>
    ${body}
  </div>
  <footer>Joon Development Group · CA General Contractor License Class B #1107974</footer>
</body>
</html>`;
}

function statePage(kind, heading, message) {
  const badge = kind === "approved" ? '<div class="badge green">✓</div>'
    : kind === "declined" ? '<div class="badge red">✕</div>'
    : '<div class="badge">?</div>';
  return pageShell(heading, `
    <div class="inner">
      <div class="state">
        ${badge}
        <h2>${esc(heading)}</h2>
        <p>${esc(message)}</p>
      </div>
    </div>`);
}

function coSummaryHtml(co) {
  const lines = (co.lineItems || []).map((line) => `
          <tr>
            <td>${esc(line.description)}</td>
            <td class="num">${esc(String(line.qty))} ${esc(line.unit)}</td>
            <td class="num">${money(line.unitCost)}</td>
            <td class="num">${money(line.total)}</td>
          </tr>`).join("");
  const markupRow = co.markupPct ? `<div>Overhead &amp; markup (${esc(String(co.markupPct))}%): <b>${money(co.total - co.subtotal)}</b></div>` : "";
  const days = Number(co.daysImpact || 0);
  const daysText = days > 0 ? `adds <b>${days} day${days === 1 ? "" : "s"}</b> to the project schedule`
    : days < 0 ? `shortens the project schedule by <b>${Math.abs(days)} day${days === -1 ? "" : "s"}</b>`
    : "has <b>no impact</b> on the project schedule";
  return `
      <div>
        <div class="eyebrow">Change Order${co.projectName ? " · " + esc(co.projectName) : ""}</div>
        <h1>${esc(co.title)}</h1>
        <div class="meta">${co.clientName ? "Prepared for " + esc(co.clientName) + " · " : ""}Sent ${esc(fmtDate(co.sentAt) || fmtDate(co.updatedAt) || "")}</div>
      </div>
      ${co.description ? `<div class="block"><h2>Scope of this change</h2><p>${esc(co.description)}</p></div>` : ""}
      ${co.reason ? `<div class="block"><h2>Why this change is needed</h2><p>${esc(co.reason)}</p></div>` : ""}
      <div class="block" style="padding:0;overflow-x:auto">
        <table>
          <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Total</th></tr></thead>
          <tbody>${lines || '<tr><td colspan="4" class="note" style="text-align:center">No line items.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="totals">
        <div>Subtotal: <b>${money(co.subtotal)}</b></div>
        ${markupRow}
        <div class="grand">Total: ${money(co.total)}</div>
      </div>
      <div class="impact">Schedule impact: this change order ${daysText}.</div>`;
}

function approvalPage(co) {
  return pageShell(co.title, `
    <div class="inner">
      ${coSummaryHtml(co)}
      <div class="sign">
        <label>Type your full name to sign
          <input id="sigName" type="text" autocomplete="name" placeholder="${esc(co.clientName || "Your full name")}" />
        </label>
        <div class="error" id="err"></div>
        <div class="btnrow">
          <button class="approve" id="btnApprove" type="button">Approve this change order</button>
          <button class="decline" id="btnDecline" type="button">Decline</button>
        </div>
        <p class="note">By approving, you authorize Joon Development Group to perform the work above and adjust the contract price and schedule accordingly. Your typed name and the date will be recorded as your electronic signature.</p>
      </div>
    </div>
    <script>
      (function () {
        var busy = false;
        function submit(action) {
          if (busy) return;
          var name = document.getElementById("sigName").value.replace(/\\s+/g, " ").trim();
          var err = document.getElementById("err");
          if (!name) { err.textContent = "Please type your full name to sign."; return; }
          if (action === "decline" && !confirm("Decline this change order?")) return;
          err.textContent = "";
          busy = true;
          document.getElementById("btnApprove").disabled = true;
          document.getElementById("btnDecline").disabled = true;
          fetch(location.pathname.replace(/\\/$/, "") + "/" + action, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signatureName: name })
          }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
              if (result.ok) { location.reload(); return; }
              err.textContent = result.data.error || "Something went wrong. Please try again.";
              busy = false;
              document.getElementById("btnApprove").disabled = false;
              document.getElementById("btnDecline").disabled = false;
            })
            .catch(function () {
              err.textContent = "Network error. Please try again.";
              busy = false;
              document.getElementById("btnApprove").disabled = false;
              document.getElementById("btnDecline").disabled = false;
            });
        }
        document.getElementById("btnApprove").addEventListener("click", function () { submit("approve"); });
        document.getElementById("btnDecline").addEventListener("click", function () { submit("decline"); });
      })();
    </script>`);
}

function decidedPage(co) {
  const approved = co.status === "approved";
  return pageShell(co.title, `
    <div class="inner">
      <div class="state">
        <div class="badge ${approved ? "green" : "red"}">${approved ? "✓" : "✕"}</div>
        <h2>Change order ${approved ? "approved" : "declined"}</h2>
        <p>${approved
    ? `Thank you${co.approvalSignatureName ? ", " + esc(co.approvalSignatureName) : ""}. This change order was approved on ${esc(fmtDate(co.approvedAt))}. We will schedule the work and keep you posted — a copy is on file with Joon Development Group.`
    : `This change order was declined on ${esc(fmtDate(co.declinedAt))}${co.approvalSignatureName ? " by " + esc(co.approvalSignatureName) : ""}. Nothing changes on your contract. If you would like to discuss alternatives, just reply to our email or give us a call.`}</p>
      </div>
      ${coSummaryHtml(co)}
    </div>`);
}

module.exports.publicRouter = function createChangeOrderApprovalRouter(collection) {
  const router = express.Router();
  router.use(express.json({ limit: "50kb" }));

  async function changeOrders() {
    return collection("changeOrders");
  }

  function tokenOf(req) {
    const raw = cleanString(req.params.token).toLowerCase();
    return /^[a-f0-9-]{20,64}$/.test(raw) ? raw : "";
  }

  router.get("/:token", async (req, res) => {
    const coll = await changeOrders();
    if (!coll) return res.status(503).type("html").send(statePage("unknown", "Temporarily unavailable", "Our approval system is briefly offline. Please try the link again in a few minutes."));
    const token = tokenOf(req);
    const co = token ? await coll.findOne({ approvalToken: token }) : null;
    if (!co) return res.status(404).type("html").send(statePage("unknown", "Link not found", "This approval link is invalid or has been replaced. Please check the link in your email, or contact Joon Development Group for a fresh copy."));
    if (co.status === "approved" || co.status === "declined") return res.type("html").send(decidedPage(co));
    if (co.status === "void" || co.status === "draft") return res.status(410).type("html").send(statePage("unknown", "No longer available", "This change order has been withdrawn. Please contact Joon Development Group if you were expecting to review it."));
    res.type("html").send(approvalPage(co));
  });

  async function decide(req, res, decision) {
    const coll = await changeOrders();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    const token = tokenOf(req);
    const co = token ? await coll.findOne({ approvalToken: token }) : null;
    if (!co) return res.status(404).json({ error: "This approval link is invalid or has been replaced." });
    if (co.status === "approved") return res.status(409).json({ error: "This change order was already approved." });
    if (co.status === "declined") return res.status(409).json({ error: "This change order was already declined." });
    if (co.status !== "sent") return res.status(410).json({ error: "This change order is no longer open for approval." });
    const signatureName = cleanString(req.body && req.body.signatureName);
    if (!signatureName) return res.status(400).json({ error: "Please type your full name to sign." });
    const now = new Date().toISOString();
    const update = {
      status: decision,
      approvalSignatureName: signatureName,
      approvalIp: cleanString(req.ip),
      updatedAt: now
    };
    if (decision === "approved") update.approvedAt = now;
    else update.declinedAt = now;
    await coll.updateOne({ _id: co._id }, { $set: update });
    res.json({ ok: true, status: decision });
  }

  router.post("/:token/approve", (req, res) => decide(req, res, "approved"));
  router.post("/:token/decline", (req, res) => decide(req, res, "declined"));

  return router;
};

module.exports.STATUSES = STATUSES;

// MOUNT (CRM, :4373):    crmApp.use("/api/changeorders", require("./changeorders")(collection));
// MOUNT (CRM page):      crmApp.get("/change_orders.html", (_req, res) => res.sendFile(path.join(__dirname, "change_orders.html")));
// MOUNT (public, :4373): publicApp.use("/co", require("./changeorders").publicRouter(collection));
