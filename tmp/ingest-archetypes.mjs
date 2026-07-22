// Ingest the LA property-archetype library into the Q&A knowledge corpus.
// One chunk per archetype -> POST {chunks} to /api/knowledge/append (dedupes on
// title, so re-running is idempotent). PORT from argv[2], default 4373.
//
//   node tmp/ingest-archetypes.mjs [PORT]
//
// NOTE: append shares the live Mongo, so only run this against a throwaway port
// (e.g. 4399) unless you intend to write the live corpus.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.argv[2] || "4373";
const LIB_PATH = path.join(__dirname, "..", "knowledge", "property-archetypes.json");

function money(n) {
  const v = Math.round(Number(n) || 0);
  return "$" + v.toLocaleString("en-US");
}
function band(b) {
  if (!Array.isArray(b) || b.length < 2) return "";
  return money(b[0]) + "–" + money(b[1]);
}

const lib = JSON.parse(fs.readFileSync(LIB_PATH, "utf8"));
const tiers = Array.isArray(lib.tiers) ? lib.tiers : [];
const tierLabel = (key) => (tiers.find((t) => t.key === key) || {}).label || key;

const chunks = (lib.archetypes || []).map((a) => {
  const nameWords = String(a.name || "").split(/[^A-Za-z0-9]+/).filter((w) => w.length > 2);
  const topics = [
    ...nameWords,
    ...(a.aliases || []),
    ...(a.neighborhoods || []),
    "property type",
    "home tier"
  ];

  const lines = [];
  lines.push(`${a.name} — a Los Angeles housing archetype (${a.stories} story, ${a.eras}).`);
  if (Array.isArray(a.neighborhoods) && a.neighborhoods.length) {
    lines.push(`Common in: ${a.neighborhoods.join(", ")}.`);
  }
  if (Array.isArray(a.aliases) && a.aliases.length) {
    lines.push(`Also called: ${a.aliases.join(", ")}.`);
  }
  if (Array.isArray(a.signature) && a.signature.length) {
    lines.push(`Signature features: ${a.signature.join("; ")}.`);
  }
  if (Array.isArray(a.interiorCharacter) && a.interiorCharacter.length) {
    lines.push(`Interior character: ${a.interiorCharacter.join("; ")}.`);
  }
  for (const key of (a.tiersPresent || [])) {
    const tn = (a.tierNotes || {})[key];
    if (!tn) continue;
    const parts = [];
    if (Array.isArray(tn.typicalFinishes) && tn.typicalFinishes.length) {
      parts.push(`typical finishes: ${tn.typicalFinishes.join("; ")}`);
    }
    const bands = tn.remodelBudgetBands || {};
    const bandStr = ["kitchen", "bath", "exteriorRefresh"]
      .map((k) => bands[k] ? `${k} ${band(bands[k])}` : "")
      .filter(Boolean)
      .join(", ");
    if (bandStr) parts.push(`remodel budget bands: ${bandStr}`);
    if (tn.renderGuidance) parts.push(`design guidance: ${tn.renderGuidance}`);
    lines.push(`${tierLabel(key)} tier — ${parts.join(". ")}.`);
  }
  if (Array.isArray(a.avoid) && a.avoid.length) {
    lines.push(`Avoid when remodeling or rendering this type: ${a.avoid.join("; ")}.`);
  }

  return {
    title: `LA housing stock — ${a.name}`,
    source: "property-archetypes.json",
    topics,
    text: lines.join("\n")
  };
});

const url = `http://localhost:${PORT}/api/knowledge/append`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chunks })
});
const bodyText = await res.text();
if (!res.ok) {
  console.error(`append failed: HTTP ${res.status} ${bodyText}`);
  process.exit(1);
}
let parsed;
try { parsed = JSON.parse(bodyText); } catch { parsed = bodyText; }
console.log(`Posted ${chunks.length} archetype chunks to ${url}`);
console.log("Server response:", parsed);
