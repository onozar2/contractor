// Build chunks from the extracted Drive sources and POST to /api/knowledge/ingest.
// Sources: tmp/knowledge-sources.json (decks + whiteboard image registry)
//        + tmp/knowledge-pdf.txt (scope-of-work PDF, sections split on the
//          PLATINUM page footer).
import fs from "fs";

const API = "http://localhost:4373/api/knowledge/ingest";
const sources = JSON.parse(fs.readFileSync("tmp/knowledge-sources.json", "utf8"));
const pdfText = fs.readFileSync("tmp/knowledge-pdf.txt", "utf8");

const driveView = (id) => `https://drive.google.com/file/d/${id}/view`;

// Topic inference for PDF sections from their titles.
const TOPIC_RULES = [
  [/acoustic|popcorn/i, ["popcorn ceiling", "acoustic ceiling", "asbestos"]],
  [/artificial grass/i, ["artificial grass", "turf", "landscaping"]],
  [/air duct/i, ["hvac", "air duct", "attic"]],
  [/bathroom|walk-in tub|fiber glass shower/i, ["bathroom", "shower", "tub", "remodel"]],
  [/blueprint/i, ["blueprints", "adu", "room addition", "plans", "permits"]],
  [/block wall/i, ["block wall", "wall", "masonry"]],
  [/countertop/i, ["countertop", "kitchen", "slab"]],
  [/carpet/i, ["carpet", "flooring"]],
  [/driveway/i, ["driveway", "cement", "concrete", "pavers"]],
  [/fence/i, ["fence", "vinyl fence", "iron fence", "wood fence"]],
  [/flooring|tile floor/i, ["flooring", "wood floor", "laminate", "tile floor"]],
  [/foundation/i, ["foundation", "retrofit", "bolting", "seismic"]],
  [/insulation/i, ["insulation", "attic", "r38", "r13"]],
  [/kitchen/i, ["kitchen", "cabinets", "refacing", "remodel"]],
  [/mold/i, ["mold", "remediation", "restoration"]],
  [/paint/i, ["paint", "painting", "interior paint", "exterior paint", "cool life", "trim"]],
  [/patio/i, ["patio", "patio cover", "patio enclosure", "deck"]],
  [/pool/i, ["pool", "re-plaster", "pool equipment", "spa"]],
  [/rain gutter/i, ["rain gutters", "gutters"]],
  [/re-pipe/i, ["plumbing", "re-pipe", "copper"]],
  [/re-drain/i, ["plumbing", "re-drain", "abs", "drain"]],
  [/re-wire/i, ["electrical", "rewire", "romex", "panel"]],
  [/retaining wall/i, ["retaining wall", "wall", "concrete"]],
  [/roofing|re-decking/i, ["roof", "roofing", "shingles", "tile roof", "flat roof"]],
  [/stucco/i, ["stucco", "exterior", "plastering"]],
  [/solar/i, ["solar", "panels"]],
  [/waterproofing/i, ["waterproofing", "balcony", "deck"]],
  [/window/i, ["windows", "vinyl windows", "retrofit"]],
];
const topicsFor = (title) => {
  for (const [pattern, topics] of TOPIC_RULES) if (pattern.test(title)) return topics;
  return [];
};

const chunks = [];

// 1. PDF sections
const pdfSections = pdfText.split(/PLATINUM \d+\s*/).map((s) => s.trim()).filter((s) => s.length > 60);
for (const section of pdfSections) {
  const title = section.split("\n")[0].trim().replace(/:$/, "");
  chunks.push({
    title: `${title} — scope of work`,
    source: "Scope of Work PDF",
    topics: topicsFor(title),
    text: section,
    driveUrl: driveView(sources.pdf.fileId),
  });
}

// 2. Decks with extracted text
for (const deck of sources.decks) {
  chunks.push({
    title: deck.title,
    source: "Client presentation",
    topics: deck.topics,
    text: deck.text,
    driveUrl: driveView(deck.fileId),
  });
}

// 3. Image-only decks (title + link so they surface as sources)
for (const deck of sources.imageOnlyDecks) {
  chunks.push({
    title: deck.title,
    source: "Client presentation (visual deck - open in Drive)",
    topics: deck.topics,
    text: `Visual client-facing deck: ${deck.title}. Covers ${deck.topics.join(", ")}. The deck is image-heavy; open it in Drive to present to a client.`,
    driveUrl: driveView(deck.fileId),
  });
}

const images = sources.images;

const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chunks, images }),
});
console.log(await res.text());
console.log(`Ingested ${chunks.length} chunks (${pdfSections.length} PDF sections) + ${images.length} images.`);
