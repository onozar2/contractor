const express = require("express");
const { ObjectId } = require("mongodb");

// AIA-style progress billing (G702/G703 pattern) for the Joon contractor CRM.
// Factory mirrors changeorders.js / suppliers.js:
// - `collection` is the app helper `async (name) => coll|null`.
// - every route returns 503 when the needed collection is null (Mongo not configured).
// - :id / :projectId routes look up documents by ObjectId.
//
// Two collections are used:
// - "projectActuals" (owned by server.js's /api/actuals) — read to build the
//   Schedule of Values, written ONLY via a scoped $set of `scheduleOfValues`.
// - "paymentApps" (owned by this module) — one document per payment application.

const STATUSES = ["draft", "sent", "paid"];
const MONGO_ERROR = "MongoDB is not configured. Set MONGODB_URI to enable server persistence.";
const CLAIMANT_NAME = "We The People Construction";

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

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function cryptoId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function projectDocId(id) {
  try { return new ObjectId(id); } catch (_error) { return null; }
}

function publicShape(row) {
  return { ...row, id: row._id.toString(), _id: undefined };
}

// ── Schedule of Values: derive from actuals lines, or use the saved custom SOV ──
function normalizeSovRow(input) {
  return {
    id: cleanString(input.id) || cryptoId(),
    description: cleanString(input.description) || "Line item",
    scheduledValue: round2(input.scheduledValue)
  };
}

// If the project has a saved custom scheduleOfValues, use it as-is (custom rows
// can diverge from the cost lines — that's the point of letting the GC edit it).
// Otherwise derive one row per actuals cost line, defaulting scheduledValue to
// that line's actualTotal (best guess at what each scope item is worth to bill).
function deriveSov(project) {
  if (Array.isArray(project.scheduleOfValues) && project.scheduleOfValues.length) {
    return { rows: project.scheduleOfValues.map(normalizeSovRow), source: "custom" };
  }
  const rows = (project.lines || []).map((line) => ({
    id: cleanString(line.id) || cryptoId(),
    description: cleanString(line.description) || cleanString(line.trade) || "Line item",
    scheduledValue: round2(line.actualTotal || 0)
  }));
  return { rows, source: "derived" };
}

module.exports = function createBillingRouter(collection) {
  const router = express.Router();

  async function paymentApps() {
    return collection("paymentApps");
  }

  async function projects() {
    return collection("projectActuals");
  }

  async function loadProject(projectId) {
    const _id = projectDocId(projectId);
    if (!_id) return null;
    const coll = await projects();
    if (!coll) return null;
    return coll.findOne({ _id });
  }

  function scheduleResponse(project) {
    const { rows, source } = deriveSov(project);
    const sumScheduled = round2(rows.reduce((sum, row) => sum + row.scheduledValue, 0));
    const contractPrice = round2(project.contractPrice || 0);
    return {
      projectId: project._id.toString(),
      projectName: cleanString(project.projectName),
      contractPrice,
      source,
      rows,
      sumScheduled,
      variance: round2(contractPrice - sumScheduled)
    };
  }

  // ── Schedule of Values ──

  router.get("/schedule/:projectId", async (req, res) => {
    const project = await loadProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(scheduleResponse(project));
  });

  router.put("/schedule/:projectId", async (req, res) => {
    const coll = await projects();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    const _id = projectDocId(req.params.projectId);
    if (!_id) return res.status(400).json({ error: "Invalid project id." });
    const existing = await coll.findOne({ _id });
    if (!existing) return res.status(404).json({ error: "Project not found." });
    const rows = (Array.isArray(req.body.scheduleOfValues) ? req.body.scheduleOfValues : []).map(normalizeSovRow);
    const updatedAt = new Date().toISOString();
    // Merge-safe: only this field + updatedAt are touched, so budget lines/photos/
    // change-order links on the actuals doc are never disturbed.
    await coll.updateOne({ _id }, { $set: { scheduleOfValues: rows, updatedAt } });
    res.json(scheduleResponse({ ...existing, scheduleOfValues: rows }));
  });

  // ── Payment applications ──

  // Chronological order (by billing period, then creation) — needed so
  // "previously billed" can be computed as everything that came before.
  function sortByPeriod(apps) {
    return apps.slice().sort((a, b) => {
      const period = cleanString(a.periodTo).localeCompare(cleanString(b.periodTo));
      if (period) return period;
      return cleanString(a.createdAt).localeCompare(cleanString(b.createdAt));
    });
  }

  function computeApp({ projectId, projectName, periodTo, retainagePct, rows, sovById, priorApps, status }) {
    const pct = round2(retainagePct);
    const computedRows = (Array.isArray(rows) ? rows : []).map((input) => {
      const sovId = cleanString(input.sovId);
      const sov = sovById.get(sovId) || { description: "", scheduledValue: 0 };
      const pctComplete = clampPct(input.pctComplete);
      const scheduledValue = round2(sov.scheduledValue);
      const completedToDate = round2(scheduledValue * (pctComplete / 100));
      const previouslyBilled = round2(priorApps.reduce((sum, app) => {
        const priorRow = (app.rows || []).find((r) => r.sovId === sovId);
        return sum + (priorRow ? Number(priorRow.thisPeriod || 0) : 0);
      }, 0));
      const thisPeriod = Math.max(0, round2(completedToDate - previouslyBilled));
      return {
        sovId,
        description: sov.description,
        scheduledValue,
        pctComplete,
        completedToDate,
        previouslyBilled,
        thisPeriod: round2(thisPeriod)
      };
    });

    const scheduledValueTotal = round2(computedRows.reduce((sum, r) => sum + r.scheduledValue, 0));
    const completedToDate = round2(computedRows.reduce((sum, r) => sum + r.completedToDate, 0));
    const retainage = round2(completedToDate * (pct / 100));
    const totalEarnedLessRetainage = round2(completedToDate - retainage);
    const previousCertificates = round2(priorApps.reduce((sum, app) => sum + Number((app.totals || {}).currentPaymentDue || 0), 0));
    const currentPaymentDue = round2(totalEarnedLessRetainage - previousCertificates);
    const balanceToFinish = round2(scheduledValueTotal - completedToDate);

    return {
      projectId,
      projectName,
      periodTo: cleanString(periodTo),
      retainagePct: pct,
      rows: computedRows,
      totals: {
        scheduledValue: scheduledValueTotal,
        completedToDate,
        retainage,
        totalEarnedLessRetainage,
        previousCertificates,
        currentPaymentDue,
        balanceToFinish
      },
      status: pickEnum(status, STATUSES, "draft"),
      updatedAt: new Date().toISOString()
    };
  }

  router.get("/", async (req, res) => {
    const coll = await paymentApps();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    const query = {};
    if (cleanString(req.query.projectId)) query.projectId = cleanString(req.query.projectId);
    const rows = await coll.find(query).sort({ periodTo: -1, createdAt: -1 }).toArray();
    res.json(rows.map(publicShape));
  });

  router.post("/", async (req, res) => {
    const appsColl = await paymentApps();
    if (!appsColl) return res.status(503).json({ error: MONGO_ERROR });
    const project = await loadProject(req.body.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });

    const { rows: sovRows } = deriveSov(project);
    const sovById = new Map(sovRows.map((row) => [row.id, row]));
    const existingApps = sortByPeriod(await appsColl.find({ projectId: project._id.toString() }).toArray());

    const retainagePct = req.body.retainagePct === undefined || req.body.retainagePct === null || req.body.retainagePct === ""
      ? 10
      : Number(req.body.retainagePct);

    const computed = computeApp({
      projectId: project._id.toString(),
      projectName: cleanString(project.projectName),
      periodTo: req.body.periodTo,
      retainagePct,
      rows: req.body.rows,
      sovById,
      priorApps: existingApps,
      status: "draft"
    });

    const doc = { ...computed, createdAt: new Date().toISOString() };
    const result = await appsColl.insertOne(doc);
    res.status(201).json({ ...doc, id: result.insertedId.toString() });
  });

  router.put("/:id", async (req, res) => {
    const appsColl = await paymentApps();
    if (!appsColl) return res.status(503).json({ error: MONGO_ERROR });
    let _id;
    try { _id = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid payment application id." }); }
    const existing = await appsColl.findOne({ _id });
    if (!existing) return res.status(404).json({ error: "Payment application not found." });

    const project = await loadProject(existing.projectId);
    if (!project) return res.status(404).json({ error: "Project for this payment application no longer exists." });

    const { rows: sovRows } = deriveSov(project);
    const sovById = new Map(sovRows.map((row) => [row.id, row]));
    const allApps = sortByPeriod(await appsColl.find({ projectId: existing.projectId }).toArray());
    const priorApps = allApps.filter((app) => app._id.toString() !== req.params.id);
    // Re-anchor "prior" to apps that sort before this one's (possibly edited) period.
    const periodTo = cleanString(req.body.periodTo !== undefined ? req.body.periodTo : existing.periodTo);
    const priorOnly = sortByPeriod(priorApps).filter((app) => {
      const cmp = cleanString(app.periodTo).localeCompare(periodTo);
      return cmp < 0 || (cmp === 0 && cleanString(app.createdAt).localeCompare(cleanString(existing.createdAt)) < 0);
    });

    const retainagePct = req.body.retainagePct === undefined || req.body.retainagePct === null || req.body.retainagePct === ""
      ? existing.retainagePct
      : Number(req.body.retainagePct);

    const computed = computeApp({
      projectId: existing.projectId,
      projectName: existing.projectName,
      periodTo,
      retainagePct,
      rows: req.body.rows !== undefined ? req.body.rows : existing.rows,
      sovById,
      priorApps: priorOnly,
      status: req.body.status !== undefined ? req.body.status : existing.status
    });

    await appsColl.updateOne({ _id }, { $set: computed });
    res.json({ ...existing, ...computed, id: req.params.id, _id: undefined });
  });

  router.delete("/:id", async (req, res) => {
    const coll = await paymentApps();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    let _id;
    try { _id = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid payment application id." }); }
    await coll.deleteOne({ _id });
    res.status(204).end();
  });

  // ── California statutory lien waivers (Civil Code §§ 8132, 8134, 8136, 8138) ──
  // Text assembled from the mandated statutory forms. Placeholders are filled from
  // the payment application; anything the app doesn't know (e.g. the customer's
  // legal name) is left as a blank line for Ori to fill in by hand before signing.

  function blank(value) {
    return cleanString(value) || "______________________";
  }

  function waiverText(type, app, project) {
    const claimant = CLAIMANT_NAME;
    const customer = blank(""); // not tracked on the actuals project doc — fill by hand
    const jobLocation = blank(project.projectName);
    const throughDate = blank(app.periodTo);
    const amount = `$${(Number(app.totals.currentPaymentDue) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (type === "conditional_progress") {
      return {
        title: "Conditional Waiver and Release on Progress Payment (Civil Code § 8132)",
        body: [
          "NOTICE TO CLAIMANT:",
          "THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS THE CLAIMANT HAS FOR LABOR AND SERVICE PROVIDED, AND EQUIPMENT AND MATERIAL DELIVERED, TO THE CUSTOMER ON THIS JOB THROUGH THE THROUGH DATE OF THIS DOCUMENT. RIGHTS BASED UPON LABOR OR SERVICE PROVIDED, OR EQUIPMENT OR MATERIAL DELIVERED, PURSUANT TO A WRITTEN CHANGE ORDER THAT HAS BEEN FULLY EXECUTED BY THE PARTIES PRIOR TO THE DATE THAT THIS DOCUMENT IS SIGNED BY THE CLAIMANT, WHETHER OR NOT SPECIFICALLY REFLECTED IN THIS DOCUMENT, ARE WAIVED AND RELEASED BY THIS DOCUMENT, UNLESS SPECIFICALLY RESERVED BY THE CLAIMANT IN THIS DOCUMENT. THIS RELEASE APPLIES REGARDLESS OF WHETHER THE CLAIM IS FOR A MATTER RELATED TO THIS DOCUMENT. THIS DOCUMENT SHOULD BE SIGNED BY THE CLAIMANT ONLY IF THE CLAIMANT HAS RECEIVED PAYMENT FROM THE FINANCIAL INSTITUTION UPON WHICH THE FOLLOWING CHECK IS DRAWN:",
          "",
          `Name of Claimant: ${claimant}`,
          `Name of Customer: ${customer}`,
          `Job Location: ${jobLocation}`,
          `Owner: ${blank("")}`,
          `Through Date: ${throughDate}`,
          "",
          `Amount of Check: ${amount}`,
          `Check Payable to: ${claimant}`,
          "",
          "This document does not affect any of the following:",
          "(1) Retentions.",
          "(2) Extras for which the claimant has not received payment.",
          "(3) The following progress payments for which the claimant has previously given a conditional waiver and release but has not received payment:",
          `    Date(s) of waiver and release: ${blank("")}`,
          `    Amount(s) of unpaid progress payment(s): ${blank("")}`,
          "(4) Contract rights, including (A) a right based on rescission, abandonment, or breach of contract, and (B) the right to recover compensation for work not compensated by the payment.",
          "",
          `Claimant's Signature: ${blank("")}`,
          `Claimant's Title: ${blank("")}`,
          `Date of Signature: ${blank("")}`
        ].join("\n")
      };
    }

    if (type === "unconditional_progress") {
      return {
        title: "Unconditional Waiver and Release on Progress Payment (Civil Code § 8134)",
        body: [
          "NOTICE TO CLAIMANT:",
          "THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS DOCUMENT IS ENFORCEABLE AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE NOT BEEN PAID. IF YOU HAVE NOT BEEN PAID, USE A CONDITIONAL WAIVER AND RELEASE FORM (CIVIL CODE SECTION 8132 OR 8136). FAILURE TO RECEIVE PAYMENT IN FULL FOR ALL LABOR, SERVICE, EQUIPMENT, OR MATERIAL PROVIDED TO THE JOB, WHETHER PROVIDED PRIOR TO OR THROUGH THE DATE OF THIS RELEASE, DOES NOT AFFECT THE FINALITY OR ENFORCEABILITY OF THIS WAIVER AND RELEASE.",
          "",
          "This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for labor and service provided, and equipment and material delivered, to the customer on this job through the through date of this document. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, whether or not specifically reflected in this document, are waived and released by this document, unless specifically reserved by the claimant in this document. This release applies regardless of whether the claim is for a matter related to this document. The claimant has received the following progress payment:",
          "",
          `Name of Claimant: ${claimant}`,
          `Name of Customer: ${customer}`,
          `Job Location: ${jobLocation}`,
          `Owner: ${blank("")}`,
          `Through Date: ${throughDate}`,
          `Amount of Progress Payment: ${amount}`,
          "",
          "This document does not affect any of the following:",
          "(1) Retentions.",
          "(2) Extras for which the claimant has not received payment.",
          "(3) Contract rights, including (A) a right based on rescission, abandonment, or breach of contract, and (B) the right to recover compensation for work not compensated by the payment.",
          "",
          `Claimant's Signature: ${blank("")}`,
          `Claimant's Title: ${blank("")}`,
          `Date of Signature: ${blank("")}`
        ].join("\n")
      };
    }

    if (type === "conditional_final") {
      return {
        title: "Conditional Waiver and Release on Final Payment (Civil Code § 8136)",
        body: [
          "NOTICE TO CLAIMANT:",
          "THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS THE CLAIMANT HAS FOR LABOR AND SERVICE PROVIDED, AND EQUIPMENT AND MATERIAL DELIVERED, TO THE CUSTOMER ON THIS JOB. RIGHTS BASED UPON LABOR OR SERVICE PROVIDED, OR EQUIPMENT OR MATERIAL DELIVERED, PURSUANT TO A WRITTEN CHANGE ORDER THAT HAS BEEN FULLY EXECUTED BY THE PARTIES PRIOR TO THE DATE THAT THIS DOCUMENT IS SIGNED BY THE CLAIMANT, WHETHER OR NOT SPECIFICALLY REFLECTED IN THIS DOCUMENT, ARE WAIVED AND RELEASED BY THIS DOCUMENT, UNLESS SPECIFICALLY RESERVED BY THE CLAIMANT IN THIS DOCUMENT. THIS RELEASE APPLIES REGARDLESS OF WHETHER THE CLAIM IS FOR A MATTER RELATED TO THIS DOCUMENT. THIS DOCUMENT SHOULD BE SIGNED BY THE CLAIMANT ONLY IF THE CLAIMANT HAS RECEIVED PAYMENT FROM THE FINANCIAL INSTITUTION UPON WHICH THE FOLLOWING CHECK IS DRAWN:",
          "",
          `Name of Claimant: ${claimant}`,
          `Name of Customer: ${customer}`,
          `Job Location: ${jobLocation}`,
          `Owner: ${blank("")}`,
          "",
          `Maker of Check: ${blank("")}`,
          `Amount of Check: ${amount}`,
          `Check Payable to: ${claimant}`,
          "",
          "This document does not affect any of the following:",
          `(1) Disputed claims for extras in the amount of: ${blank("")}`,
          "",
          `Claimant's Signature: ${blank("")}`,
          `Claimant's Title: ${blank("")}`,
          `Date of Signature: ${blank("")}`
        ].join("\n")
      };
    }

    // unconditional_final
    return {
      title: "Unconditional Waiver and Release on Final Payment (Civil Code § 8138)",
      body: [
        "NOTICE TO CLAIMANT:",
        "THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS DOCUMENT IS ENFORCEABLE AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE NOT BEEN PAID. IF YOU HAVE NOT BEEN PAID, USE A CONDITIONAL WAIVER AND RELEASE FORM (CIVIL CODE SECTION 8132 OR 8136). FAILURE TO RECEIVE PAYMENT IN FULL FOR ALL LABOR, SERVICE, EQUIPMENT, OR MATERIAL PROVIDED TO THE JOB RESULTS IN THE LOSS OF YOUR LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS, SO YOU SHOULD NOT SIGN THIS DOCUMENT UNTIL YOU ARE PAID IN FULL.",
        "",
        "This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for all labor and service provided, and equipment and material delivered, to the customer on this job. The claimant has been paid in full.",
        "",
        `Name of Claimant: ${claimant}`,
        `Name of Customer: ${customer}`,
        `Job Location: ${jobLocation}`,
        `Owner: ${blank("")}`,
        "",
        "This document does not affect any of the following:",
        `(1) Disputed claims for extras in the amount of: ${blank("")}`,
        "",
        `Claimant's Signature: ${blank("")}`,
        `Claimant's Title: ${blank("")}`,
        `Date of Signature: ${blank("")}`
      ].join("\n")
    };
  }

  router.get("/:id/waiver", async (req, res) => {
    const coll = await paymentApps();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    const type = pickEnum(req.query.type, ["conditional_progress", "unconditional_progress", "conditional_final", "unconditional_final"], "");
    if (!type) return res.status(400).json({ error: "type must be one of conditional_progress, unconditional_progress, conditional_final, unconditional_final." });
    let _id;
    try { _id = new ObjectId(req.params.id); } catch (_error) { return res.status(400).json({ error: "Invalid payment application id." }); }
    const app = await coll.findOne({ _id });
    if (!app) return res.status(404).json({ error: "Payment application not found." });
    const project = await loadProject(app.projectId);
    res.json(waiverText(type, app, project || { projectName: app.projectName }));
  });

  // ── Cash-flow summary ──

  router.get("/summary/:projectId", async (req, res) => {
    const coll = await paymentApps();
    if (!coll) return res.status(503).json({ error: MONGO_ERROR });
    const project = await loadProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const apps = sortByPeriod(await coll.find({ projectId: project._id.toString() }).toArray());

    const latestAny = apps[apps.length - 1] || null;
    const billedApps = apps.filter((a) => a.status === "sent" || a.status === "paid");
    const latestBilled = billedApps[billedApps.length - 1] || null;

    // Earned = the most recent (any status) app's cumulative completed-to-date —
    // the best current read of how much work is actually in the ground.
    const earnedToDate = round2(latestAny ? latestAny.totals.completedToDate : 0);
    // Billed = cumulative amount actually invoiced (sent/paid), net of retainage —
    // i.e. what has actually gone out the door as a pay application.
    const billedToDate = round2(latestBilled ? latestBilled.totals.totalEarnedLessRetainage : 0);
    const retainageHeld = round2(latestBilled ? latestBilled.totals.retainage : 0);

    res.json({
      projectId: project._id.toString(),
      projectName: cleanString(project.projectName),
      billedToDate,
      earnedToDate,
      underBilled: round2(earnedToDate - billedToDate),
      retainageHeld
    });
  });

  return router;
};

module.exports.STATUSES = STATUSES;
module.exports.CLAIMANT_NAME = CLAIMANT_NAME;

// MOUNT: crmApp.use("/api/billing", require("./billing")(collection));
