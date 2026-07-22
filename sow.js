const express = require("express");
const fs = require("fs");
const path = require("path");
const { ObjectId } = require("mongodb");

// Joon Scope of Work system (Ori, 2026-07-20).
// - knowledge/scope-library.json holds predrafted, client-ready scope blocks per
//   job type (distilled from the two "template scope process" docs in Ori's
//   Construction notes: the Platinum "Scope of work of products" + the 2023
//   Construction Manual). The builder swaps these into a document fast.
// - sowDocs (Mongo) holds each client's Scope of Work document.
// - GET /:id/doc renders the formal, uniform Joon Development Group document
//   (letterhead from brands/joon/brand.json, CSLB-compliant payment schedule,
//   CA notices, signature blocks, and — when design concepts are attached —
//   the AI-render disclaimer).
// Mount: crmApp.use("/api/sow", require("./sow")(collection));

const { AI_DISCLAIMER } = require("./designreview");

const LIBRARY_PATH = path.join(__dirname, "knowledge", "scope-library.json");
let _libCache = { mtimeMs: 0, data: null };
function loadLibrary() {
  try {
    const stat = fs.statSync(LIBRARY_PATH);
    if (!_libCache.data || stat.mtimeMs !== _libCache.mtimeMs) {
      _libCache = { mtimeMs: stat.mtimeMs, data: JSON.parse(fs.readFileSync(LIBRARY_PATH, "utf8")) };
    }
    return _libCache.data;
  } catch (_e) {
    return null;
  }
}

let _brandCache = null;
function brand() {
  if (_brandCache) return _brandCache;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "brands", "joon", "brand.json"), "utf8"));
    _brandCache = {
      companyName: raw.companyName || "Joon Development Group",
      tagline: raw.tagline || "",
      licenseText: raw.licenseText || "",
      phone: raw.phone || "",
      email: raw.email || "",
      serviceArea: raw.serviceArea || ""
    };
  } catch (_e) {
    _brandCache = { companyName: "Joon Development Group", tagline: "", licenseText: "", phone: "", email: "", serviceArea: "" };
  }
  return _brandCache;
}

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function cleanList(value) {
  return (Array.isArray(value) ? value : []).map((v) => cleanString(v)).filter(Boolean);
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function money(n) {
  const v = Number(n) || 0;
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// CSLB-compliant default: deposit capped at the lesser of 10% or $1,000
// (Bus. & Prof. Code §7159.5), progress tied to completed work, final balance
// due only at completion/walk-through.
const DEFAULT_PAYMENT_SCHEDULE = [
  { stage: "Deposit at signing", pct: 0, note: "Lesser of 10% of contract price or $1,000 (California B&P Code §7159.5) — credited against the payment due at start of work." },
  { stage: "Start of work / material order", pct: 30, note: "Due when work begins or custom materials are ordered." },
  { stage: "Completion of rough work", pct: 35, note: "Demo, framing, rough plumbing/electrical complete and inspected where applicable." },
  { stage: "Substantial completion of finish work", pct: 25, note: "Tile set, fixtures in, systems connected." },
  { stage: "Final balance at walk-through", pct: 10, note: "Due after punch-list completion and final walk-through. Never pay the final balance before completion." }
];

const DEFAULT_INTRO =
  "Joon Development Group is an owner-operated Southern California general contractor. " +
  "This Scope of Work defines exactly what we will build, what is included, what is excluded, " +
  "and how the project will be paid for — so there are no surprises for either side. " +
  "The work described here, and only the work described here, is the agreement.";

const GENERAL_PROVISIONS = [
  "All work is performed in a professional manner consistent with California building codes and industry standards.",
  "The job site is kept clean during construction; all construction debris is hauled away at completion.",
  "Any change to this scope requires a written, signed change order stating the change and its price before the changed work begins.",
  "Where existing conditions are patched (drywall, stucco, paint), Joon matches the surrounding finish as closely as practical; an exact match to aged existing finishes is not guaranteed.",
  "Homes built before 1978 may require lead and asbestos testing before demolition; if hazardous materials are found, certified abatement is a separate scope.",
  "Client is responsible for removing valuables from work areas and access paths before work begins.",
  "Joon carries the insurance and licensing stated on this document and provides an unconditional lien release upon final payment."
];

function normalizeSection(input) {
  const body = input && typeof input === "object" ? input : {};
  return {
    jobTypeId: cleanString(body.jobTypeId).slice(0, 80),
    name: cleanString(body.name).slice(0, 120),
    summary: cleanString(body.summary).slice(0, 400),
    steps: cleanList(body.steps),
    selections: cleanList(body.selections),
    inclusions: cleanList(body.inclusions),
    exclusions: cleanList(body.exclusions),
    inspections: cleanList(body.inspections),
    notes: cleanList(body.notes),
    price: cleanNumber(body.price)
  };
}

function normalizeRenderRef(input) {
  const body = input && typeof input === "object" ? input : {};
  const upload = (v) => (cleanString(v).startsWith("/uploads/") ? cleanString(v) : "");
  return {
    renderId: cleanString(body.renderId).slice(0, 40),
    title: cleanString(body.title).slice(0, 120),
    style: cleanString(body.style).slice(0, 60),
    beforeUrl: upload(body.beforeUrl),
    afterUrl: upload(body.afterUrl),
    feasibility: cleanString(body.feasibility).slice(0, 12),
    priceLow: cleanNumber(body.priceLow),
    priceHigh: cleanNumber(body.priceHigh)
  };
}

function normalizeDoc(input, existing) {
  const body = input && typeof input === "object" ? input : {};
  // Every row is guarded (row && typeof row === "object") — a single [null] in
  // a request body must never throw inside the async handler (it killed the
  // whole process in review loop 1).
  const asRow = (row) => (row && typeof row === "object" ? row : {});
  const schedule = (Array.isArray(body.paymentSchedule) && body.paymentSchedule.length
    ? body.paymentSchedule
    : (existing && existing.paymentSchedule) || DEFAULT_PAYMENT_SCHEDULE
  ).map(asRow).map((row) => ({
    stage: cleanString(row.stage).slice(0, 160),
    pct: cleanNumber(row.pct),
    note: cleanString(row.note).slice(0, 300)
  })).filter((row) => row.stage);
  return {
    clientName: cleanString(body.clientName).slice(0, 160),
    clientAddress: cleanString(body.clientAddress).slice(0, 240),
    clientPhone: cleanString(body.clientPhone).slice(0, 60),
    clientEmail: cleanString(body.clientEmail).slice(0, 120),
    projectAddress: cleanString(body.projectAddress).slice(0, 240),
    projectName: cleanString(body.projectName).slice(0, 160),
    intro: cleanMultiline(body.intro).slice(0, 2000) || (existing && existing.intro) || DEFAULT_INTRO,
    sections: (Array.isArray(body.sections) ? body.sections : []).map(normalizeSection)
      .filter((s) => s.name || s.steps.length)
      .map((s) => (s.name ? s : { ...s, name: "Untitled scope" })),   // never silently drop an edited section
    renders: (Array.isArray(body.renders) ? body.renders : []).map(normalizeRenderRef).filter((r) => r.afterUrl),
    allowances: (Array.isArray(body.allowances) ? body.allowances : []).map(asRow).map((row) => ({
      item: cleanString(row.item).slice(0, 160),
      amount: cleanNumber(row.amount),
      note: cleanString(row.note).slice(0, 240)
    })).filter((row) => row.item),
    priceTotal: cleanNumber(body.priceTotal),
    priceNote: cleanString(body.priceNote).slice(0, 400),
    paymentSchedule: schedule,
    startDate: cleanString(body.startDate).slice(0, 40),
    durationText: cleanString(body.durationText).slice(0, 120),
    status: ["draft", "sent", "signed"].includes(cleanString(body.status)) ? cleanString(body.status) : ((existing && existing.status) || "draft"),
    updatedAt: new Date().toISOString()
  };
}

function mapRow(row) {
  return { ...row, id: row._id.toString(), _id: undefined };
}

/* ─────────────────────────── printable document ─────────────────────────── */

function sectionHtml(section, index) {
  const li = (items) => items.map((s) => `<li>${esc(s)}</li>`).join("");
  const block = (label, items, cls) => items.length
    ? `<div class="sub ${cls || ""}"><h4>${esc(label)}</h4><ul>${li(items)}</ul></div>` : "";
  return `<section class="scope">
    <h3><span class="num">${index + 1}</span> ${esc(section.name)}${section.price ? `<span class="secprice">${money(section.price)}</span>` : ""}</h3>
    ${section.summary ? `<p class="summary">${esc(section.summary)}</p>` : ""}
    ${section.steps.length ? `<ol class="steps">${li(section.steps)}</ol>` : ""}
    <div class="subgrid">
      ${block("Included", section.inclusions, "inc")}
      ${block("Not included", section.exclusions, "exc")}
    </div>
    ${block("Client selections", section.selections)}
    ${block("Inspections", section.inspections)}
    ${section.notes.length ? `<div class="sub notes"><h4>Notes</h4><ul>${li(section.notes)}</ul></div>` : ""}
  </section>`;
}

function renderConceptHtml(ref) {
  const range = ref.priceLow || ref.priceHigh
    ? `<span class="pill">Concept budget guidance: ${money(ref.priceLow)}–${money(ref.priceHigh)}</span>` : "";
  return `<figure class="concept">
    <div class="pair">
      <div><span class="lab">Current</span><img src="${esc(ref.beforeUrl)}" alt="Current condition" /></div>
      <div><span class="lab after">AI design concept</span><img src="${esc(ref.afterUrl)}" alt="AI design concept" /></div>
    </div>
    <figcaption>${esc(ref.title || "Design concept")}${ref.style ? ` · ${esc(ref.style)}` : ""} ${range}</figcaption>
  </figure>`;
}

function docHtml(doc) {
  const b = brand();
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const pctSum = doc.paymentSchedule.reduce((sum, row) => sum + (Number(row.pct) || 0), 0);
  const sectionsPriced = doc.sections.some((s) => s.price);
  const sectionSum = doc.sections.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>${esc(doc.docNumber)} · Scope of Work | ${esc(b.companyName)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --ink:#172033; --steel:#3c4658; --muted:#687587; --line:#d8dee8; --soft:#f5f7fa; --accent:#b85c38; --charcoal:#101828; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Georgia, "Times New Roman", serif; color: var(--ink); line-height: 1.5; background:#e9edf2; }
  .page { max-width: 8.5in; margin: 0 auto; background: #fff; padding: 0.9in 0.85in; box-shadow: 0 10px 40px rgba(16,24,40,0.12); }
  .toolbar { max-width: 8.5in; margin: 0 auto; padding: 0.6rem 0; display: flex; gap: 0.5rem; font-family: Inter, system-ui, sans-serif; }
  .toolbar button { border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 0.45rem 0.9rem; font: inherit; font-weight: 700; cursor: pointer; }
  header.letterhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; border-bottom: 3px solid var(--charcoal); padding-bottom: 0.9rem; }
  .wordmark { font-family: Inter, system-ui, sans-serif; }
  .wordmark b { display: block; font-size: 1.45rem; letter-spacing: 0.14em; color: var(--charcoal); }
  .wordmark span { display:block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.18em; color: var(--accent); font-weight: 700; margin-top: 0.15rem; }
  .lh-contact { text-align: right; font-family: Inter, system-ui, sans-serif; font-size: 0.74rem; color: var(--steel); line-height: 1.6; }
  .doctitle { margin: 1.3rem 0 0.2rem; font-family: Inter, system-ui, sans-serif; }
  .doctitle h1 { font-size: 1.25rem; letter-spacing: 0.04em; text-transform: uppercase; }
  .doctitle .legal { font-size: 0.7rem; color: var(--muted); margin-top: 0.2rem; }
  .metagrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.5rem; margin: 1rem 0 0; font-family: Inter, system-ui, sans-serif; font-size: 0.85rem; border: 1px solid var(--line); border-radius: 8px; padding: 0.8rem 1rem; }
  .metagrid dt { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 800; margin-top: 0.55rem; }
  .metagrid dd { color: var(--ink); }
  h2.part { font-family: Inter, system-ui, sans-serif; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent); border-bottom: 1px solid var(--line); padding-bottom: 0.3rem; margin: 1.8rem 0 0.8rem; }
  .intro { font-size: 0.95rem; color: var(--steel); }
  section.scope { margin: 0 0 1.2rem; break-inside: avoid-page; }
  section.scope h3 { font-family: Inter, system-ui, sans-serif; font-size: 1rem; display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.35rem; }
  section.scope h3 .num { flex: 0 0 auto; width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--charcoal); color: #fff; font-size: 0.75rem; display: inline-flex; align-items: center; justify-content: center; }
  section.scope h3 .secprice { margin-left: auto; font-size: 0.95rem; color: var(--charcoal); }
  section.scope .summary { font-size: 0.88rem; color: var(--muted); margin-bottom: 0.4rem; }
  ol.steps { margin: 0.4rem 0 0.6rem 1.4rem; font-size: 0.92rem; }
  ol.steps li { margin-bottom: 0.18rem; }
  .subgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin: 0.5rem 0; }
  .sub { border: 1px solid var(--line); border-radius: 8px; padding: 0.55rem 0.75rem; font-family: Inter, system-ui, sans-serif; }
  .sub h4 { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.3rem; }
  .sub ul { margin-left: 1.1rem; font-size: 0.8rem; }
  .sub.inc { background: #f2f8f4; border-color: #cfe5d6; }
  .sub.exc { background: #fbf4f2; border-color: #ecd4cb; }
  .sub.notes { background: var(--soft); }
  .concept { margin: 0.9rem 0; break-inside: avoid-page; }
  .concept .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .concept .pair > div { position: relative; }
  .concept img { width: 100%; border-radius: 8px; display: block; border: 1px solid var(--line); }
  .concept .lab { position: absolute; top: 0.45rem; left: 0.45rem; background: rgba(16,24,40,0.8); color: #fff; font-family: Inter, system-ui, sans-serif; font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; padding: 0.14rem 0.5rem; border-radius: 999px; }
  .concept .lab.after { background: var(--accent); }
  .concept figcaption { font-family: Inter, system-ui, sans-serif; font-size: 0.78rem; color: var(--steel); margin-top: 0.35rem; }
  .concept .pill { display: inline-block; background: var(--soft); border: 1px solid var(--line); border-radius: 999px; padding: 0.05rem 0.55rem; font-size: 0.7rem; margin-left: 0.4rem; }
  .ai-note { border: 1.5px solid var(--accent); background: #fdf7f3; border-radius: 8px; padding: 0.7rem 0.9rem; font-family: Inter, system-ui, sans-serif; font-size: 0.78rem; color: #7a3a1d; margin: 0.6rem 0 0; }
  table { width: 100%; border-collapse: collapse; font-family: Inter, system-ui, sans-serif; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
  td.r, th.r { text-align: right; white-space: nowrap; }
  tr.total td { font-weight: 800; border-top: 2px solid var(--charcoal); border-bottom: 0; }
  .warn { font-family: Inter, system-ui, sans-serif; font-size: 0.72rem; color: #b42318; margin-top: 0.3rem; }
  ul.prov { margin-left: 1.3rem; font-size: 0.88rem; }
  ul.prov li { margin-bottom: 0.25rem; }
  .notice { font-size: 0.78rem; color: var(--steel); background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 0.7rem 0.9rem; margin-bottom: 0.6rem; font-family: Inter, system-ui, sans-serif; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-top: 2.2rem; font-family: Inter, system-ui, sans-serif; font-size: 0.85rem; }
  .sig .line { border-bottom: 1.5px solid var(--ink); height: 2.4rem; }
  .sig .who { font-size: 0.72rem; color: var(--muted); margin-top: 0.3rem; display: flex; justify-content: space-between; }
  footer.docfoot { margin-top: 2rem; padding-top: 0.7rem; border-top: 1px solid var(--line); font-family: Inter, system-ui, sans-serif; font-size: 0.68rem; color: var(--muted); display: flex; justify-content: space-between; }
  @media print { body { background: #fff; } .page { box-shadow: none; padding: 0.35in 0.4in; max-width: none; } .toolbar { display: none; } }
  @media (max-width: 640px) { .page { padding: 1.2rem; } .subgrid, .concept .pair, .metagrid, .sigs { grid-template-columns: 1fr; } .lh-contact { text-align: left; } header.letterhead { flex-direction: column; } }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">🖨️ Print / Save as PDF</button></div>
<div class="page">
  <header class="letterhead">
    <div class="wordmark"><b>JOON</b><span>Development Group</span></div>
    <div class="lh-contact">
      ${esc(b.licenseText)}<br />
      ${esc(b.phone)} · ${esc(b.email)}<br />
      ${esc(b.serviceArea)}
    </div>
  </header>

  <div class="doctitle">
    <h1>Scope of Work</h1>
    <div class="legal">This Scope of Work is incorporated by reference into the parties' Home Improvement Contract (California Business &amp; Professions Code §7159), which contains the statutory notices in full.</div>
  </div>

  <dl class="metagrid">
    <div>
      <dt>Document</dt><dd>${esc(doc.docNumber)} · ${esc(today)}</dd>
      <dt>Client</dt><dd>${esc(doc.clientName || "—")}${doc.clientAddress ? `<br />${esc(doc.clientAddress)}` : ""}</dd>
      <dt>Contact</dt><dd>${esc([doc.clientPhone, doc.clientEmail].filter(Boolean).join(" · ") || "—")}</dd>
    </div>
    <div>
      <dt>Project</dt><dd>${esc(doc.projectName || "—")}</dd>
      <dt>Project address</dt><dd>${esc(doc.projectAddress || doc.clientAddress || "—")}</dd>
      <dt>Estimated schedule</dt><dd>${esc([doc.startDate && `Start ${doc.startDate}`, doc.durationText].filter(Boolean).join(" · ") || "To be scheduled at signing")}</dd>
    </div>
  </dl>

  <h2 class="part">About this document</h2>
  <p class="intro">${esc(doc.intro)}</p>

  ${doc.renders.length ? `
  <h2 class="part">Design concepts</h2>
  ${doc.renders.map(renderConceptHtml).join("")}
  <div class="ai-note"><b>AI visualization notice.</b> ${esc(AI_DISCLAIMER)}</div>` : ""}

  <h2 class="part">Scope of work</h2>
  ${doc.sections.length ? doc.sections.map(sectionHtml).join("") : '<p class="intro">No scope sections added yet.</p>'}

  ${doc.allowances.length ? `
  <h2 class="part">Allowances &amp; client-supplied items</h2>
  <table>
    <thead><tr><th>Item</th><th>Note</th><th class="r">Allowance</th></tr></thead>
    <tbody>${doc.allowances.map((row) => `<tr><td>${esc(row.item)}</td><td>${esc(row.note)}</td><td class="r">${row.amount ? money(row.amount) : "Client supplied"}</td></tr>`).join("")}</tbody>
  </table>` : ""}

  <h2 class="part">Contract price</h2>
  <table>
    ${sectionsPriced ? `<thead><tr><th>Scope section</th><th class="r">Price</th></tr></thead>
    <tbody>${doc.sections.filter((s) => s.price).map((s) => `<tr><td>${esc(s.name)}</td><td class="r">${money(s.price)}</td></tr>`).join("")}</tbody>` : ""}
    <tbody><tr class="total"><td>Total contract price</td><td class="r">${(doc.priceTotal || sectionSum) ? money(doc.priceTotal || sectionSum) : "To be priced"}</td></tr></tbody>
  </table>
  ${doc.priceNote ? `<p class="intro" style="margin-top:0.4rem;font-size:0.85rem">${esc(doc.priceNote)}</p>` : ""}
  ${sectionsPriced && doc.priceTotal && Math.abs(sectionSum - doc.priceTotal) > 0.01 ? `<div class="warn">Section prices sum to ${money(sectionSum)} but the stated total is ${money(doc.priceTotal)} — reconcile before sending.</div>` : ""}

  <h2 class="part">Payment schedule</h2>
  <table>
    <thead><tr><th>Stage</th><th>Due when</th><th class="r">Share</th></tr></thead>
    <tbody>${doc.paymentSchedule.map((row) => `<tr><td>${esc(row.stage)}</td><td>${esc(row.note)}</td><td class="r">${row.pct ? row.pct + "%" : "—"}</td></tr>`).join("")}</tbody>
  </table>
  ${!doc.paymentSchedule.length ? `<div class="warn">No payment stages defined — a Joon document never goes out without a payment schedule.</div>`
    : Math.abs(pctSum - 100) > 0.01 ? `<div class="warn">Payment stages sum to ${pctSum}% — a Joon schedule must total exactly 100% before the document goes out.</div>` : ""}

  <h2 class="part">General provisions</h2>
  <ul class="prov">${GENERAL_PROVISIONS.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>

  <h2 class="part">Your rights as a California homeowner — courtesy summary</h2>
  <div class="notice" style="border-style:dashed"><i>The summaries below are provided for convenience. The signed Home Improvement Contract contains the required statutory notices in their full legal wording.</i></div>
  <div class="notice"><b>Three-day right to cancel.</b> You, the buyer, have the right to cancel this contract within three business days after signing (five business days if you are 65 or older). Cancellation notice may be delivered by mail, email, or in person to ${esc(b.companyName)} using the contact information on this document.</div>
  <div class="notice"><b>Mechanics lien warning.</b> Anyone who helps improve your property and is not paid may record what is called a mechanics lien on your property. To preserve their right to record a lien, subcontractors and material suppliers may serve you with a document called a Preliminary Notice; this is not a lien and is not a reflection of the contractor's payment status. Joon provides unconditional lien releases upon final payment.</div>
  <div class="notice"><b>License verification.</b> Verify this contractor's license at <b>www.cslb.ca.gov</b> — ${esc(b.licenseText)}.</div>

  <h2 class="part">Acceptance</h2>
  <div class="sigs">
    <div class="sig"><div class="line"></div><div class="who"><span>Client — ${esc(doc.clientName || "")}</span><span>Date</span></div></div>
    <div class="sig"><div class="line"></div><div class="who"><span>${esc(b.companyName)}</span><span>Date</span></div></div>
  </div>

  <footer class="docfoot">
    <span>${esc(b.companyName)} · ${esc(b.licenseText)}</span>
    <span>${esc(doc.docNumber)} · Page will paginate on print</span>
  </footer>
</div>
</body>
</html>`;
}

/* ─────────────────────────────── router ─────────────────────────────── */

module.exports = (collection) => {
  const router = express.Router();
  router.use(express.json({ limit: "2mb" }));
  const noDb = { error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." };

  async function sows() {
    return collection("sowDocs");
  }

  // The predrafted-scopes toolbox (hot-reloads when the JSON changes on disk).
  router.get("/library", (_req, res) => {
    const lib = loadLibrary();
    if (!lib) return res.status(503).json({ error: "scope-library.json is missing or invalid." });
    res.json({ ...lib, disclaimer: AI_DISCLAIMER, defaults: { intro: DEFAULT_INTRO, paymentSchedule: DEFAULT_PAYMENT_SCHEDULE, generalProvisions: GENERAL_PROVISIONS } });
  });

  router.get("/", async (_req, res) => {
    const coll = await sows();
    if (!coll) return res.status(503).json(noDb);
    const rows = await coll.find({}).sort({ createdAt: -1 }).limit(300).toArray();
    res.json(rows.map((row) => ({
      id: row._id.toString(),
      docNumber: row.docNumber,
      clientName: row.clientName,
      projectName: row.projectName,
      projectAddress: row.projectAddress,
      status: row.status,
      priceTotal: row.priceTotal,
      sections: (row.sections || []).length,
      renders: (row.renders || []).length,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt
    })));
  });

  // A client-facing doc number must be unique FOREVER — an atomic $inc counter
  // (collection "counters") survives deletes of the highest doc and concurrent
  // creates. First use seeds the counter from the existing max so historical
  // numbers are never re-minted.
  async function nextDocNumber(coll) {
    const year = new Date().getFullYear();
    const counters = await collection("counters");
    const key = `sowDocNumber-${year}`;
    if (counters) {
      const existing = await counters.findOne({ _id: key });
      if (!existing) {
        const rows = await coll.find({ docNumber: new RegExp(`^SOW-${year}-`) }).project({ docNumber: 1 }).toArray();
        const max = rows.reduce((best, row) => {
          const m = String(row.docNumber || "").match(/-(\d+)$/);
          return m ? Math.max(best, parseInt(m[1], 10)) : best;
        }, 0);
        await counters.updateOne({ _id: key }, { $setOnInsert: { seq: max } }, { upsert: true });
      }
      const row = await counters.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { returnDocument: "after" });
      const seq = row && Number(row.seq);
      if (Number.isFinite(seq) && seq > 0) return `SOW-${year}-${String(seq).padStart(3, "0")}`;
    }
    // Counter collection unavailable — fall back to max+1 (best effort).
    const rows = await coll.find({ docNumber: new RegExp(`^SOW-${year}-`) }).project({ docNumber: 1 }).toArray();
    const max = rows.reduce((best, row) => {
      const m = String(row.docNumber || "").match(/-(\d+)$/);
      return m ? Math.max(best, parseInt(m[1], 10)) : best;
    }, 0);
    return `SOW-${year}-${String(max + 1).padStart(3, "0")}`;
  }

  // The spec's rule lives at the data layer too: a SOW may only carry
  // designer-APPROVED renders, with the designer's own review numbers — refs
  // that don't resolve to an approved designRender are dropped, and the
  // authoritative fields come from the render document, not the request body.
  async function verifyRenderRefs(refs) {
    if (!refs.length) return [];
    const coll = await collection("designRenders");
    if (!coll) return [];
    const out = [];
    for (const ref of refs) {
      let record = null;
      try { record = await coll.findOne({ _id: new ObjectId(ref.renderId) }); } catch { record = null; }
      if (!record || record.status !== "approved") continue;
      out.push({
        renderId: record._id.toString(),
        title: record.title || ref.title || "Design concept",
        style: record.style || "",
        beforeUrl: record.beforeUrl,
        afterUrl: record.afterUrl,
        feasibility: (record.review && record.review.feasibility) || "",
        priceLow: (record.review && record.review.priceLow) || 0,
        priceHigh: (record.review && record.review.priceHigh) || 0
      });
    }
    return out;
  }

  router.post("/", async (req, res) => {
    const coll = await sows();
    if (!coll) return res.status(503).json(noDb);
    const normalized = normalizeDoc(req.body, null);
    normalized.renders = await verifyRenderRefs(normalized.renders);
    const doc = {
      ...normalized,
      docNumber: await nextDocNumber(coll),
      createdAt: new Date().toISOString()
    };
    const result = await coll.insertOne(doc);
    res.status(201).json({ ...doc, id: result.insertedId.toString() });
  });

  router.get("/:id", async (req, res) => {
    const coll = await sows();
    if (!coll) return res.status(503).json(noDb);
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id." }); }
    const row = await coll.findOne({ _id });
    if (!row) return res.status(404).json({ error: "Scope of Work not found." });
    res.json(mapRow(row));
  });

  router.put("/:id", async (req, res) => {
    const coll = await sows();
    if (!coll) return res.status(503).json(noDb);
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id." }); }
    const existing = await coll.findOne({ _id });
    if (!existing) return res.status(404).json({ error: "Scope of Work not found." });
    const update = normalizeDoc(req.body, existing);
    update.renders = await verifyRenderRefs(update.renders);
    await coll.updateOne({ _id }, { $set: update });
    res.json({ ...mapRow(existing), ...update });
  });

  router.delete("/:id", async (req, res) => {
    const coll = await sows();
    if (!coll) return res.status(503).json(noDb);
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: "Bad id." }); }
    await coll.deleteOne({ _id });
    res.status(204).end();
  });

  // The formal printable document (print → Save as PDF from the browser).
  router.get("/:id/doc", async (req, res) => {
    const coll = await sows();
    if (!coll) return res.status(503).send("MongoDB is not configured.");
    let _id;
    try { _id = new ObjectId(req.params.id); } catch { return res.status(400).send("Bad id."); }
    const row = await coll.findOne({ _id });
    if (!row) return res.status(404).send("Scope of Work not found.");
    res.type("html").send(docHtml(mapRow(row)));
  });

  return router;
};
