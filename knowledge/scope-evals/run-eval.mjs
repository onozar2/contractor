#!/usr/bin/env node
// Scope-of-work practice-loop eval runner. Zero new deps — uses Node's built-in
// fetch and fs/path only. See README.md in this folder for how/when to run this.
//
// For each case in cases.json: POST /api/bids/draft-scope, save the raw response,
// then score it deterministically against that case's required/forbidden elements,
// a section-structure sanity check, and a length-band check. Writes one JSON file
// per case plus a scoreboard.md under runs/<timestamp>/.
//
// Usage:
//   node run-eval.mjs                 # full 10-case run against localhost:4373
//   node run-eval.mjs --base=http://localhost:4373
//   node run-eval.mjs --only=01,04    # just these case ids (substring match), for
//                                     # quick iteration while tuning the prompt
//
// Cases spawn the local `claude` CLI server-side (~1-3 min each). This script runs
// them strictly sequentially — do not parallelize past what bids.js itself allows.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { base: "http://localhost:4373", only: null };
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.replace(/^--/, "").split("=");
    if (key === "base" && value) args.base = value;
    if (key === "only" && value) args.only = value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

function loadCases() {
  const file = path.join(__dirname, "cases.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return data;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// --- matching helpers -------------------------------------------------

function anyMatch(text, patterns) {
  for (const p of patterns) {
    try {
      if (new RegExp(p, "i").test(text)) return { hit: true, pattern: p };
    } catch (_e) {
      // bad regex in cases.json — treat as literal substring
      if (text.toLowerCase().includes(p.toLowerCase())) return { hit: true, pattern: p };
    }
  }
  return { hit: false, pattern: null };
}

function evaluateRequired(text, item) {
  if (item.groups) {
    const groupResults = item.groups.map((g) => anyMatch(text, g));
    const hit = groupResults.every((r) => r.hit);
    return { id: item.id, label: item.label, hit, evidence: groupResults.map((r) => r.pattern).filter(Boolean).join(" + ") };
  }
  const r = anyMatch(text, item.patterns || []);
  return { id: item.id, label: item.label, hit: r.hit, evidence: r.pattern || "" };
}

function evaluateForbidden(text, item) {
  const r = anyMatch(text, item.patterns || []);
  return { id: item.id, label: item.label, hit: r.hit, evidence: r.pattern || "" };
}

// Trade-by-trade section-structure sanity: flags sections that don't read as
// numbered/actionable lines, and checks demo appears before finish/cleanup
// trades in the overall line ordering (loose ordering check, not strict —
// real gold docs interleave, e.g. inspections appear mid-sequence).
const DEMO_WORDS = /\bdemo|remove|tear.off\b/i;
const CLEANUP_WORDS = /\bclean|haul.away|haul\b/i;

function structureSanity(sections) {
  const issues = [];
  if (!sections.length) {
    issues.push("no sections returned");
    return { ok: false, issues };
  }
  let demoLineIndex = -1;
  let cleanupLineIndex = -1;
  let lineCursor = 0;
  let emptyTradeCount = 0;
  for (const section of sections) {
    if (!section.trade || !section.trade.trim()) emptyTradeCount++;
    if (!Array.isArray(section.lines) || !section.lines.length) {
      issues.push(`section "${section.trade || "(untitled)"}" has no lines`);
    }
    for (const line of section.lines || []) {
      if (demoLineIndex === -1 && DEMO_WORDS.test(line)) demoLineIndex = lineCursor;
      if (CLEANUP_WORDS.test(line)) cleanupLineIndex = lineCursor;
      lineCursor++;
    }
  }
  if (emptyTradeCount) issues.push(`${emptyTradeCount} section(s) missing a trade name`);
  if (demoLineIndex >= 0 && cleanupLineIndex >= 0 && cleanupLineIndex < demoLineIndex) {
    issues.push("cleanup/haul-away line appears before demo — ordering looks off");
  }
  return { ok: issues.length === 0, issues };
}

function totalLines(sections) {
  return (sections || []).reduce((sum, s) => sum + (Array.isArray(s.lines) ? s.lines.length : 0), 0);
}

function flattenText(sections, notes) {
  const lines = (sections || []).flatMap((s) => [s.trade || "", ...(s.lines || [])]);
  return [...lines, ...(notes || [])].join("\n");
}

// --- scoring ------------------------------------------------------------

function scoreCase(testCase, response, globalForbidden) {
  const sections = response.sections || [];
  const notes = response.notes || [];
  const text = flattenText(sections, notes);

  const requiredResults = testCase.required.map((item) => evaluateRequired(text, item));
  const requiredHits = requiredResults.filter((r) => r.hit).length;
  const coveragePct = testCase.required.length ? Math.round((requiredHits / testCase.required.length) * 1000) / 10 : 100;

  const forbiddenResults = globalForbidden.map((item) => evaluateForbidden(text, item))
    .concat((testCase.forbidden || []).map((item) => evaluateForbidden(text, item)));
  const forbiddenHits = forbiddenResults.filter((r) => r.hit);

  const lines = totalLines(sections);
  const band = testCase.lengthBand || { min: 0, max: Infinity };
  const lengthOk = lines >= band.min && lines <= band.max;

  const structure = structureSanity(sections);

  const pass = coveragePct >= 85 && forbiddenHits.length === 0 && lengthOk && structure.ok;

  return {
    caseId: testCase.id,
    projectTitle: testCase.projectTitle,
    engine: response.engine || "unknown",
    coveragePct,
    requiredHits,
    requiredTotal: testCase.required.length,
    requiredResults,
    forbiddenHits,
    lines,
    lengthBand: band,
    lengthOk,
    structure,
    pass
  };
}

// --- run ------------------------------------------------------------

async function draftScope(base, testCase) {
  const res = await fetch(`${base}/api/bids/draft-scope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectTitle: testCase.projectTitle, description: testCase.description })
  });
  const bodyText = await res.text();
  let body;
  try { body = JSON.parse(bodyText); } catch (_e) { body = { error: `non-JSON response: ${bodyText.slice(0, 300)}` }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error || bodyText.slice(0, 300)}`);
  return body;
}

function scoreboardMarkdown(runId, results, args) {
  const lines = [];
  lines.push(`# Scope-of-work eval — ${runId}`);
  lines.push("");
  lines.push(`Base: ${args.base}${args.only ? `  |  only: ${args.only.join(",")}` : ""}`);
  lines.push("");
  const passCount = results.filter((r) => r.pass).length;
  const avgCoverage = Math.round((results.reduce((s, r) => s + r.coveragePct, 0) / results.length) * 10) / 10;
  const totalForbidden = results.reduce((s, r) => s + r.forbiddenHits.length, 0);
  lines.push(`**${passCount}/${results.length} cases passing** | avg required-coverage **${avgCoverage}%** | forbidden hits total: **${totalForbidden}**`);
  lines.push("");
  lines.push("| Case | Coverage | Req hits | Forbidden | Lines | Band | Structure | Pass |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(`| ${r.caseId} | ${r.coveragePct}% | ${r.requiredHits}/${r.requiredTotal} | ${r.forbiddenHits.length} | ${r.lines} | ${r.lengthBand.min}-${r.lengthBand.max} | ${r.structure.ok ? "ok" : r.structure.issues.join("; ")} | ${r.pass ? "PASS" : "fail"} |`);
  }
  lines.push("");
  lines.push("## Misses by case");
  lines.push("");
  for (const r of results) {
    const misses = r.requiredResults.filter((rr) => !rr.hit);
    if (!misses.length && !r.forbiddenHits.length && r.lengthOk && r.structure.ok) continue;
    lines.push(`### ${r.caseId} (${r.projectTitle})`);
    if (misses.length) {
      lines.push("Missing required elements:");
      for (const m of misses) lines.push(`- ${m.id}: ${m.label}`);
    }
    if (r.forbiddenHits.length) {
      lines.push("Forbidden hits:");
      for (const f of r.forbiddenHits) lines.push(`- ${f.id}: ${f.label} (matched "${f.evidence}")`);
    }
    if (!r.lengthOk) lines.push(`Length out of band: ${r.lines} lines (band ${r.lengthBand.min}-${r.lengthBand.max}).`);
    if (!r.structure.ok) lines.push(`Structure issues: ${r.structure.issues.join("; ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  const data = loadCases();
  let cases = data.cases;
  if (args.only) cases = cases.filter((c) => args.only.some((token) => c.id.includes(token)));
  if (!cases.length) {
    console.error("No cases matched --only filter.");
    process.exit(1);
  }

  const runId = timestamp();
  const runDir = path.join(__dirname, "runs", runId);
  fs.mkdirSync(runDir, { recursive: true });

  console.log(`Running ${cases.length} case(s) against ${args.base}. Output -> ${runDir}`);

  const results = [];
  let caseIndex = 0;
  for (const testCase of cases) {
    caseIndex++;
    const label = `[${caseIndex}/${cases.length}] ${testCase.id}`;
    const startedAt = Date.now();
    console.log(`${label} — drafting...`);
    let response;
    try {
      response = await draftScope(args.base, testCase);
    } catch (error) {
      console.error(`${label} — ERROR: ${error.message}`);
      response = { sections: [], notes: [`ERROR: ${error.message}`], engine: "error" };
    }
    const elapsedSec = Math.round((Date.now() - startedAt) / 100) / 10;
    const scored = scoreCase(testCase, response, data.globalForbidden);
    scored.elapsedSec = elapsedSec;
    results.push(scored);

    const outFile = path.join(runDir, `${testCase.id}.json`);
    fs.writeFileSync(outFile, JSON.stringify({ case: testCase, response, score: scored }, null, 2));

    console.log(`${label} — ${scored.pass ? "PASS" : "fail"} | coverage ${scored.coveragePct}% (${scored.requiredHits}/${scored.requiredTotal}) | forbidden ${scored.forbiddenHits.length} | lines ${scored.lines} (band ${scored.lengthBand.min}-${scored.lengthBand.max}) | ${elapsedSec}s`);
  }

  const md = scoreboardMarkdown(runId, results, args);
  fs.writeFileSync(path.join(runDir, "scoreboard.md"), md);

  const passCount = results.filter((r) => r.pass).length;
  const avgCoverage = Math.round((results.reduce((s, r) => s + r.coveragePct, 0) / results.length) * 10) / 10;
  console.log("");
  console.log(`Done. ${passCount}/${results.length} passing, avg coverage ${avgCoverage}%. Scoreboard: ${path.join(runDir, "scoreboard.md")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
