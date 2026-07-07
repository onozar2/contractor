const express = require("express");
const crypto = require("crypto");
const { ObjectId } = require("mongodb");

// RFQ (request-for-quote) module for the Joon subcontractor-finder CRM.
// JACK-app-style flow: pick roster subs on bid_lab.html, create an RFQ with a
// snapshot of the bid project's line items, copy a personal email draft per
// sub, and let each sub submit pricing on a tokenized public page (:4173).
// Factory mirrors suppliers.js:
// - `collection` is the app helper `async (name) => coll|null`.
// - every route returns 503 when Mongo is not configured.
// Data lives in the "rfqs" collection; accepted responses are also pushed into
// the parent bid project's subQuotes array (exact server.js shape) so they show
// up in the existing bid-lab comparison automatically.

const RECIPIENT_STATUSES = ["sent", "viewed", "responded", "declined"];

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanString).filter(Boolean))];
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function cryptoId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mintToken() {
  return crypto.randomBytes(18).toString("hex");
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Exact copy of server.js normalizeSubQuote so pushed responses match the
// shape the bid-lab comparison table already renders.
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

// Mirror of server.js fixedBidReadiness so readiness flags stay consistent
// after we append subQuotes from outside server.js.
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

function normalizeLineItemSnapshot(input) {
  return {
    id: cleanString(input.id || cryptoId()),
    trade: cleanString(input.trade),
    description: cleanString(input.description),
    quantity: cleanString(input.quantity),
    unit: cleanString(input.unit),
    allowance: cleanString(input.allowance),
    notes: cleanString(input.notes)
  };
}

function normalizeRecipient(input) {
  return {
    subId: cleanString(input.subId),
    companyName: cleanString(input.companyName),
    email: cleanString(input.email).toLowerCase(),
    ownerName: cleanString(input.ownerName),
    serviceCategory: cleanString(input.serviceCategory),
    responseToken: mintToken(),
    status: "sent",
    sentAt: new Date().toISOString(),
    viewedAt: "",
    respondedAt: "",
    response: null
  };
}

function rfqTrades(rfq) {
  return [...new Set((rfq.lineItems || []).map((item) => cleanString(item.trade)).filter(Boolean))];
}

function rfqLocation(rfq) {
  return [rfq.neighborhood, rfq.city].filter(Boolean).join(", ");
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_SITE_URL) return cleanString(process.env.PUBLIC_SITE_URL).replace(/\/+$/, "");
  const publicPort = process.env.PUBLIC_PORT || process.env.PORT || 4173;
  return `http://${req.hostname}:${publicPort}`;
}

function responseUrlFor(req, recipient) {
  return `${publicBaseUrl(req)}/rfq/${recipient.responseToken}`;
}

function mapRfq(row, req) {
  return {
    ...row,
    id: row._id.toString(),
    _id: undefined,
    recipients: (row.recipients || []).map((recipient) => ({ ...recipient, responseUrl: responseUrlFor(req, recipient) }))
  };
}

function firstName(recipient) {
  const raw = cleanString(recipient.ownerName || recipient.companyName || "there");
  return raw.split(/\s+/)[0] || "there";
}

function formatDueDate(value) {
  const raw = cleanString(value);
  if (!raw) return "";
  const time = Date.parse(`${raw}T12:00:00`);
  if (Number.isNaN(time)) return raw;
  return new Date(time).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function buildEmailDraft(rfq, recipient, link) {
  const trades = rfqTrades(rfq);
  const tradeText = trades.length ? trades.join(", ").replace(/, ([^,]*)$/, " and $1") : (rfq.scopeTitle || "the scope");
  const location = rfqLocation(rfq) || "the LA area";
  const due = formatDueDate(rfq.dueDate);
  const scopeLines = (rfq.lineItems || []).map((item) => `- ${item.trade ? `${item.trade}: ` : ""}${item.description || "scope to review"}${item.quantity ? ` (${[item.quantity, item.unit].filter(Boolean).join(" ")})` : ""}`);
  const subject = `Pricing for ${(rfq.projectType || rfq.scopeTitle || "a project").toLowerCase()} in ${location} - ${tradeText}`;
  const body = [
    `Hi ${firstName(recipient)},`,
    "",
    `This is Ori with We The People Construction. We have a ${rfq.projectType || "remodel"} in ${location} and I'd like to get your number on the ${tradeText} portion.`,
    "",
    "Here's the scope we need priced:",
    ...(scopeLines.length ? scopeLines : ["- Scope details are on the quote page below."]),
    ...(rfq.notes ? ["", rfq.notes] : []),
    "",
    "You can send your pricing straight through this page - it shows the line items and takes a couple of minutes, no login:",
    link,
    "",
    ...(due ? [`We're putting our numbers together by ${due}, so anything before then helps a lot.`, ""] : []),
    "If you'd rather talk it through first, or you need photos or a site walk before committing to a number, just reply here and we'll set it up.",
    "",
    "Appreciate it,",
    "Ori",
    "We The People Construction"
  ].join("\n");
  return { subject, body };
}

// ── Public quote-submission page (served on :4173) ──

function publicPageShell(title, inner) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>${esc(title)} | We The People Construction</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --ink: #172033; --steel: #3c4658; --muted: #687587; --mist: #eef2f6; --white: #ffffff; --line: #d8dee8; --charcoal: #101828; --blue: #2563eb; --green: #0f766e; --red: #b42318; }
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--mist); color: var(--ink); line-height: 1.55; }
    .topbar { background: var(--charcoal); color: rgba(255,255,255,0.82); padding: 0.6rem 5vw; font-size: 0.82rem; }
    .topbar strong { color: var(--white); letter-spacing: 0.06em; text-transform: uppercase; }
    main { max-width: 760px; margin: 0 auto; padding: 1.5rem 5vw 4rem; }
    .eyebrow { color: var(--blue); font-size: 0.78rem; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; }
    h1 { margin-top: 0.35rem; font-size: clamp(1.6rem, 3.4vw, 2.3rem); line-height: 1.08; }
    h2 { font-size: 1.05rem; margin-bottom: 0.45rem; }
    .muted { color: var(--muted); }
    .panel { border: 1px solid var(--line); border-radius: 8px; background: var(--white); box-shadow: 0 8px 22px rgba(16,24,40,0.05); padding: 1rem; margin-top: 1rem; }
    .panel.head { border-top: 4px solid var(--blue); }
    .meta { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.6rem; }
    .badge { display: inline-flex; align-items: center; min-height: 26px; border-radius: 999px; padding: 0 0.65rem; font-size: 0.74rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; background: var(--mist); color: var(--steel); }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.9rem; }
    th, td { border-bottom: 1px solid var(--line); padding: 0.55rem; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; }
    label { display: block; color: var(--steel); font-size: 0.76rem; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 0.3rem; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 6px; min-height: 44px; padding: 0.6rem 0.75rem; background: var(--white); color: var(--ink); font: inherit; }
    input:focus, select:focus, textarea:focus { outline: 2px solid rgba(37,99,235,0.2); border-color: var(--blue); }
    textarea { min-height: 80px; resize: vertical; }
    .price-input { max-width: 150px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin-top: 0.75rem; }
    .full { grid-column: 1 / -1; }
    .mode-row { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 0.5rem; font-weight: 800; color: var(--steel); }
    .mode-row label { display: inline-flex; align-items: center; gap: 0.4rem; text-transform: none; letter-spacing: 0; font-size: 0.9rem; margin: 0; cursor: pointer; }
    .mode-row input { width: auto; min-height: 0; }
    button { min-height: 44px; border: 0; border-radius: 6px; background: var(--blue); color: var(--white); font: inherit; font-weight: 900; padding: 0 1.1rem; cursor: pointer; }
    button:hover { background: var(--ink); }
    button.ghost { background: var(--white); color: var(--steel); border: 1px solid var(--line); }
    button.ghost:hover { color: var(--red); border-color: var(--red); background: var(--white); }
    .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; margin-top: 1rem; }
    .form-status { min-height: 22px; margin-top: 0.55rem; font-weight: 800; font-size: 0.88rem; color: var(--green); }
    .form-status.error { color: var(--red); }
    .done { text-align: center; padding: 2.4rem 1rem; }
    .done h1 { margin-top: 0.5rem; }
    footer { color: var(--muted); font-size: 0.8rem; text-align: center; padding: 0 5vw 2rem; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="topbar"><strong>We The People Construction</strong> &nbsp;|&nbsp; Subcontractor quote request</div>
  <main>${inner}</main>
  <footer>We The People Construction - Los Angeles, CA. This link is private to your company; pricing goes straight to Ori.</footer>
</body>
</html>`;
}

function invalidTokenPage() {
  return publicPageShell("Quote link not found", `
    <div class="panel head done">
      <div class="eyebrow">Quote request</div>
      <h1>This quote link isn't active</h1>
      <p class="muted" style="margin-top:0.6rem;">It may have been removed or replaced with a newer request. If you got here from an email, reply to that email and we'll send you a fresh link.</p>
    </div>`);
}

function alreadyRespondedPage(rfq, recipient) {
  const response = recipient.response || {};
  const declined = recipient.status === "declined";
  const summary = declined
    ? "You let us know this one isn't a fit. No action needed."
    : `We received your ${response.pricingMode === "line" ? "line-item pricing" : "quote"}${response.total ? ` totaling ${esc(money(response.total))}` : ""} on ${esc((recipient.respondedAt || "").slice(0, 10))}.`;
  return publicPageShell("Quote already received", `
    <div class="panel head done">
      <div class="eyebrow">${esc(rfq.scopeTitle || "Quote request")}</div>
      <h1>${declined ? "Thanks for letting us know" : "We already have your quote"}</h1>
      <p class="muted" style="margin-top:0.6rem;">${summary}</p>
      <p class="muted" style="margin-top:0.6rem;">Need to change anything? Reply to the original email and Ori will update it on our side.</p>
    </div>`);
}

function quoteFormPage(rfq, recipient) {
  const location = rfqLocation(rfq);
  const due = formatDueDate(rfq.dueDate);
  const rows = (rfq.lineItems || []).map((item) => `
        <tr>
          <td><strong>${esc(item.trade || "General")}</strong><br /><span class="muted">${esc(item.description || "")}</span></td>
          <td>${esc([item.quantity, item.unit].filter(Boolean).join(" ") || "-")}</td>
          <td><input class="price-input line-price" data-line="${esc(item.id)}" type="number" min="0" step="50" placeholder="$" /></td>
        </tr>`).join("");
  const inner = `
    <div class="panel head">
      <div class="eyebrow">Quote request for ${esc(recipient.companyName || "your company")}</div>
      <h1>${esc(rfq.scopeTitle || rfq.projectType || "Project scope")}</h1>
      <div class="meta">
        ${rfq.projectType ? `<span class="badge">${esc(rfq.projectType)}</span>` : ""}
        ${location ? `<span class="badge">${esc(location)}</span>` : ""}
        ${due ? `<span class="badge">Reply by ${esc(due)}</span>` : ""}
      </div>
      <p class="muted" style="margin-top:0.7rem;">Hi${recipient.ownerName ? ` ${esc(firstName(recipient))}` : ""} - Ori here. Price what's below, note anything you're excluding, and hit send. Takes a couple of minutes and it comes straight to me.</p>
      ${rfq.notes ? `<p class="muted" style="margin-top:0.55rem;"><strong style="color:var(--ink);">Notes from us:</strong> ${esc(rfq.notes)}</p>` : ""}
    </div>
    <form id="quoteForm" class="panel">
      <h2>Your pricing</h2>
      <div class="mode-row">
        <label><input type="radio" name="pricingMode" value="line" checked /> Price per line item</label>
        <label><input type="radio" name="pricingMode" value="lump" /> One lump sum</label>
      </div>
      <div id="lineSection">
        <table>
          <thead><tr><th>Scope item</th><th>Qty</th><th>Your price</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="lumpSection" hidden style="margin-top:0.75rem;">
        <label for="lumpSum">Lump sum for everything above</label>
        <input id="lumpSum" class="price-input" type="number" min="0" step="100" placeholder="$" />
      </div>
      <div class="grid">
        <div><label for="leadTime">Lead time / earliest start</label><input id="leadTime" placeholder="e.g. 2 weeks out, 3-4 days on site" /></div>
        <div><label for="confidence">Confidence in this number</label><select id="confidence"><option value="high">High - ready to hold it</option><option value="medium" selected>Medium - solid ballpark</option><option value="low">Low - need more info</option></select></div>
        <div class="full"><label for="exclusions">Exclusions / what's not included</label><textarea id="exclusions" placeholder="Permits, patch and paint, material allowances, disposal..."></textarea></div>
        <div class="full"><label for="rfqNotes">Anything you need from us</label><textarea id="rfqNotes" placeholder="Photos, measurements, a site walk, selections..."></textarea></div>
        <div><label for="respondentName">Your name</label><input id="respondentName" required placeholder="First and last name" value="${esc(recipient.ownerName || "")}" /></div>
      </div>
      <div class="actions">
        <button type="submit">Send quote to Ori</button>
        <button id="declineButton" class="ghost" type="button">Can't take this one</button>
      </div>
      <div id="formStatus" class="form-status" aria-live="polite"></div>
    </form>
    <script>
      (function () {
        var form = document.getElementById("quoteForm");
        var status = document.getElementById("formStatus");
        var lineSection = document.getElementById("lineSection");
        var lumpSection = document.getElementById("lumpSection");
        function mode() { return document.querySelector("input[name=pricingMode]:checked").value; }
        Array.prototype.forEach.call(document.querySelectorAll("input[name=pricingMode]"), function (radio) {
          radio.addEventListener("change", function () {
            lineSection.hidden = mode() !== "line";
            lumpSection.hidden = mode() !== "lump";
          });
        });
        function payload(declined) {
          var linePrices = [];
          Array.prototype.forEach.call(document.querySelectorAll(".line-price"), function (input) {
            if (input.value !== "") linePrices.push({ lineItemId: input.dataset.line, price: Number(input.value) });
          });
          return {
            declined: Boolean(declined),
            pricingMode: mode(),
            linePrices: linePrices,
            lumpSum: Number(document.getElementById("lumpSum").value || 0),
            leadTime: document.getElementById("leadTime").value,
            confidence: document.getElementById("confidence").value,
            exclusions: document.getElementById("exclusions").value,
            notes: document.getElementById("rfqNotes").value,
            respondentName: document.getElementById("respondentName").value
          };
        }
        function submit(declined) {
          var body = payload(declined);
          if (!declined && !body.respondentName.trim()) { status.className = "form-status error"; status.textContent = "Add your name so we know who priced it."; return; }
          if (!declined && body.pricingMode === "line" && !body.linePrices.length) { status.className = "form-status error"; status.textContent = "Add a price to at least one line item, or switch to lump sum."; return; }
          if (!declined && body.pricingMode === "lump" && !body.lumpSum) { status.className = "form-status error"; status.textContent = "Enter your lump-sum number."; return; }
          status.className = "form-status"; status.textContent = "Sending...";
          fetch(window.location.pathname, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
            .then(function (response) { return response.json().then(function (data) { return { ok: response.ok, data: data }; }); })
            .then(function (result) {
              if (!result.ok) throw new Error(result.data.error || "Could not submit.");
              document.querySelector("main").innerHTML = '<div class="panel head done"><div class="eyebrow">All set</div><h1>' + (declined ? "Thanks for letting us know" : "Quote sent - thank you") + '</h1><p class="muted" style="margin-top:0.6rem;">' + (declined ? "We took you off this request. We'll keep you in mind for the next one that fits." : "Your pricing went straight to Ori at We The People Construction. If anything changes, reply to the original email.") + "</p></div>";
            })
            .catch(function (error) { status.className = "form-status error"; status.textContent = error.message; });
        }
        form.addEventListener("submit", function (event) { event.preventDefault(); submit(false); });
        document.getElementById("declineButton").addEventListener("click", function () {
          if (confirm("Pass on this one? We'll mark it declined and stop following up.")) submit(true);
        });
      })();
    </script>`;
  return publicPageShell(rfq.scopeTitle || "Quote request", inner);
}

// ── Response -> subQuotes bridge ──
// Push an accepted response into the parent bid project's subQuotes using the
// exact server.js shape, then recompute fixed-bid readiness.
function buildSubQuotesFromResponse(rfq, recipient, response) {
  const now = new Date().toISOString();
  const base = {
    subcontractorId: recipient.subId,
    subcontractorName: recipient.companyName,
    status: "received",
    turnaround: response.leadTime,
    exclusions: response.exclusions,
    requiredInputs: response.notes,
    confidence: response.confidence || "unknown",
    requestedAt: rfq.createdAt || "",
    receivedAt: now
  };
  const tag = `Via RFQ "${rfq.scopeTitle || rfq.projectType || "quote request"}"${response.respondentName ? ` - priced by ${response.respondentName}` : ""}`;
  if (response.pricingMode === "line" && Array.isArray(response.linePrices) && response.linePrices.length) {
    const byTrade = new Map();
    for (const entry of response.linePrices) {
      const item = (rfq.lineItems || []).find((line) => line.id === entry.lineItemId);
      const trade = cleanString((item && item.trade) || "General");
      const bucket = byTrade.get(trade) || { total: 0, lines: [] };
      bucket.total += Number(entry.price || 0);
      bucket.lines.push(`${(item && item.description) || entry.lineItemId}: ${money(entry.price)}`);
      byTrade.set(trade, bucket);
    }
    return [...byTrade.entries()].map(([trade, bucket]) => normalizeSubQuote({
      ...base,
      trade,
      quoteFixed: bucket.total,
      notes: `${tag}. ${bucket.lines.join("; ")}`
    }));
  }
  const trades = rfqTrades(rfq);
  return [normalizeSubQuote({
    ...base,
    trade: trades.length === 1 ? trades[0] : trades.join(" + "),
    quoteFixed: Number(response.lumpSum || 0),
    notes: `${tag}. Lump sum covering: ${trades.join(", ") || "full RFQ scope"}.`
  })];
}

async function pushResponseIntoBidProject(collection, rfq, recipient, response) {
  if (!rfq.bidProjectId || !ObjectId.isValid(rfq.bidProjectId)) return;
  const coll = await collection("bidProjects");
  if (!coll) return;
  const record = await coll.findOne({ _id: new ObjectId(rfq.bidProjectId) });
  if (!record) return;
  const additions = buildSubQuotesFromResponse(rfq, recipient, response);
  const subQuotes = [...(Array.isArray(record.subQuotes) ? record.subQuotes : []), ...additions];
  const readiness = fixedBidReadiness({ ...record, subQuotes });
  await coll.updateOne({ _id: record._id }, { $set: { subQuotes, fixedBidReady: readiness.ready, fixedBidReadinessNotes: readiness.notes, updatedAt: new Date().toISOString() } });
}

// ── CRM router (mount at /api/rfq on the :4373 app) ──

module.exports = function createRfqRouter(collection) {
  const router = express.Router();

  async function rfqs() {
    return collection("rfqs");
  }

  router.post("/", async (req, res) => {
    const coll = await rfqs();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const bidProjectId = cleanString(req.body.bidProjectId);
    if (!ObjectId.isValid(bidProjectId)) return res.status(400).json({ error: "A valid bidProjectId is required." });
    const recipients = (Array.isArray(req.body.recipients) ? req.body.recipients : []).map(normalizeRecipient).filter((recipient) => recipient.email);
    if (!recipients.length) return res.status(400).json({ error: "Pick at least one subcontractor with an email address." });
    const lineItems = (Array.isArray(req.body.lineItems) ? req.body.lineItems : []).map(normalizeLineItemSnapshot);

    const bidColl = await collection("bidProjects");
    const project = bidColl ? await bidColl.findOne({ _id: new ObjectId(bidProjectId) }) : null;
    if (!project) return res.status(404).json({ error: "Bid project not found." });

    const now = new Date().toISOString();
    const doc = {
      bidProjectId,
      scopeTitle: cleanString(req.body.scopeTitle) || cleanString(project.projectType) || "Quote request",
      projectType: cleanString(project.projectType),
      customerName: cleanString(project.customerName),
      city: cleanString(project.city),
      neighborhood: cleanString(project.neighborhood),
      dueDate: cleanString(req.body.dueDate),
      notes: cleanString(req.body.notes),
      lineItems,
      recipients,
      createdAt: now,
      updatedAt: now
    };
    const result = await coll.insertOne(doc);
    res.status(201).json(mapRfq({ ...doc, _id: result.insertedId }, req));
  });

  router.get("/", async (req, res) => {
    const coll = await rfqs();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const query = {};
    const bidProjectId = cleanString(req.query.bidProjectId);
    if (bidProjectId) query.bidProjectId = bidProjectId;
    const rows = await coll.find(query).sort({ createdAt: -1 }).toArray();
    res.json(rows.map((row) => {
      const mapped = mapRfq(row, req);
      const counts = { sent: 0, viewed: 0, responded: 0, declined: 0 };
      for (const recipient of mapped.recipients) {
        if (counts[recipient.status] !== undefined) counts[recipient.status] += 1;
      }
      return { ...mapped, statusCounts: counts };
    }));
  });

  router.get("/:id", async (req, res) => {
    const coll = await rfqs();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid RFQ id." });
    const row = await coll.findOne({ _id: new ObjectId(req.params.id) });
    if (!row) return res.status(404).json({ error: "RFQ not found." });
    res.json(mapRfq(row, req));
  });

  router.delete("/:id", async (req, res) => {
    const coll = await rfqs();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid RFQ id." });
    await coll.deleteOne({ _id: new ObjectId(req.params.id) });
    res.status(204).end();
  });

  // Ready-to-send drafts per recipient. Never sends anything: copy/paste only.
  router.get("/:id/emails", async (req, res) => {
    const coll = await rfqs();
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid RFQ id." });
    const row = await coll.findOne({ _id: new ObjectId(req.params.id) });
    if (!row) return res.status(404).json({ error: "RFQ not found." });
    const drafts = (row.recipients || []).map((recipient) => {
      const link = responseUrlFor(req, recipient);
      const draft = buildEmailDraft(row, recipient, link);
      return {
        subId: recipient.subId,
        companyName: recipient.companyName,
        email: recipient.email,
        status: recipient.status,
        responseUrl: link,
        subject: draft.subject,
        body: draft.body
      };
    });
    res.json({ rfqId: req.params.id, scopeTitle: row.scopeTitle, drafts });
  });

  return router;
};

// ── Public router (mount at /rfq on the :4173 app) ──

module.exports.publicRouter = function createRfqPublicRouter(collection) {
  const router = express.Router();
  router.use(express.json({ limit: "200kb" }));

  async function findByToken(token) {
    const coll = await collection("rfqs");
    if (!coll) return { coll: null, rfq: null, recipient: null };
    const clean = cleanString(token);
    if (!/^[a-f0-9]{24,64}$/i.test(clean)) return { coll, rfq: null, recipient: null };
    const rfq = await coll.findOne({ "recipients.responseToken": clean });
    const recipient = rfq ? (rfq.recipients || []).find((row) => row.responseToken === clean) : null;
    return { coll, rfq, recipient };
  }

  router.get("/:token", async (req, res) => {
    const { coll, rfq, recipient } = await findByToken(req.params.token);
    if (!coll) return res.status(503).type("html").send(publicPageShell("Temporarily unavailable", "<div class=\"panel head done\"><h1>Quote page is briefly offline</h1><p class=\"muted\" style=\"margin-top:0.6rem;\">Please try again in a few minutes or reply to the email you received.</p></div>"));
    if (!rfq || !recipient) return res.status(404).type("html").send(invalidTokenPage());
    if (recipient.status === "responded" || recipient.status === "declined") return res.type("html").send(alreadyRespondedPage(rfq, recipient));
    if (recipient.status === "sent") {
      await coll.updateOne(
        { _id: rfq._id, recipients: { $elemMatch: { responseToken: recipient.responseToken, status: "sent" } } },
        { $set: { "recipients.$.status": "viewed", "recipients.$.viewedAt": new Date().toISOString(), updatedAt: new Date().toISOString() } }
      );
    }
    res.type("html").send(quoteFormPage(rfq, recipient));
  });

  router.post("/:token", async (req, res) => {
    const { coll, rfq, recipient } = await findByToken(req.params.token);
    if (!coll) return res.status(503).json({ error: "Storage is briefly offline. Please try again in a few minutes." });
    if (!rfq || !recipient) return res.status(404).json({ error: "This quote link is no longer active." });
    if (recipient.status === "responded" || recipient.status === "declined") return res.status(409).json({ error: "We already have a response for this link. Reply to the original email if anything changed." });

    const declined = Boolean(req.body.declined);
    const linePrices = (Array.isArray(req.body.linePrices) ? req.body.linePrices : [])
      .map((entry) => ({ lineItemId: cleanString(entry.lineItemId), price: Number(entry.price || 0) }))
      .filter((entry) => entry.lineItemId && entry.price > 0);
    const pricingMode = req.body.pricingMode === "lump" ? "lump" : "line";
    const lumpSum = Number(req.body.lumpSum || 0);
    const total = pricingMode === "line" ? linePrices.reduce((sum, entry) => sum + entry.price, 0) : lumpSum;
    if (!declined && total <= 0) return res.status(400).json({ error: "Add pricing to at least one line item or a lump sum." });

    const now = new Date().toISOString();
    const response = {
      declined,
      pricingMode,
      linePrices,
      lumpSum,
      total,
      leadTime: cleanString(req.body.leadTime),
      confidence: cleanString(req.body.confidence || "unknown").toLowerCase(),
      exclusions: cleanString(req.body.exclusions),
      notes: cleanString(req.body.notes),
      respondentName: cleanString(req.body.respondentName),
      submittedAt: now
    };

    const update = await coll.updateOne(
      { _id: rfq._id, recipients: { $elemMatch: { responseToken: recipient.responseToken, status: { $in: ["sent", "viewed"] } } } },
      { $set: { "recipients.$.status": declined ? "declined" : "responded", "recipients.$.respondedAt": now, "recipients.$.response": response, updatedAt: now } }
    );
    if (!update.matchedCount) return res.status(409).json({ error: "We already have a response for this link." });

    if (!declined) {
      try {
        await pushResponseIntoBidProject(collection, rfq, recipient, response);
      } catch (_error) {
        // The RFQ response itself is saved; sync into the bid project is best-effort.
      }
    }
    res.status(201).json({ ok: true, declined });
  });

  return router;
};

module.exports.RECIPIENT_STATUSES = RECIPIENT_STATUSES;

// MOUNT (CRM, :4373):   crmApp.use("/api/rfq", require("./rfq")(collection));
// MOUNT (public, :4173): publicApp.use("/rfq", require("./rfq").publicRouter(collection));
