// A/B exterior render test: control (today's prompt shape) vs candidate (+ landscape design clause)
import fs from "fs";

const PRESERVE = "STRUCTURE-PRESERVING edit of a house exterior: this is the SAME photograph re-finished — keep the EXACT camera position, distance and framing including the street, sidewalk, driveway, fences and neighboring context visible in the photo (do NOT zoom in, crop, or move closer); keep the house footprint, massing and rooflines EXACTLY as they are — do NOT add, enlarge or project any entry, tower, porch or addition volume; the front door and every window stay in their exact positions and sizes; change ONLY surface finishes, colors, trim profiles, light fixtures, hardscape surfaces and planting.";
const BASE = "Redesign this house exterior in Modern Minimalist style (clean lines, high-contrast palette, organic texture). Fresh white smooth stucco, matte black window frames, a modern wood slat front door, and drought tolerant landscaping. Bright airy daylight. Mood: crisp, calm, contemporary. " + PRESERVE + " Photorealistic, consistent shadows and lighting direction, magazine-quality photography, professionally staged.";
const LAND = " LANDSCAPING DESIGN: make the planting FULLER and more layered than the existing yard, never sparser — a continuous low groundcover band at the front bed edges, massed drifts of drought-tolerant grasses and shrubs in odd-numbered groups of 3 and 5 behind them, and 2-3 sculptural accent agaves or aloes as focal points; keep the existing young tree exactly where it is; rich dark-brown mulch beds with crisp defined edges; decomposed granite only as narrow accent bands beside the walkway, never as whole-bed cover; every plant lush, healthy and thriving.";

const img = fs.readFileSync("uploads/knowledge-questions/q-mrl2n5tk.jpg");
const runs = [["control", BASE], ["candidate", BASE + LAND]];
for (const [name, p] of runs) {
  const t0 = Date.now();
  const r = await fetch("http://localhost:4373/api/knowledge/redesign?n=2&quality=fast&prompt=" + encodeURIComponent(p), {
    method: "POST", headers: { "Content-Type": "image/jpeg" }, body: img
  });
  const j = await r.json();
  console.log(name + ":", r.status, ((Date.now() - t0) / 1000).toFixed(1) + "s", JSON.stringify(j.images || [j.imageUrl] || j.error));
  fs.writeFileSync("tmp/render-" + name + ".json", JSON.stringify(j));
}
