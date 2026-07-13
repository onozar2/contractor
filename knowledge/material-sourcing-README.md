# material-sourcing.json — where the sourcing data lives & how to update it

## Where the data is stored (three places, by design)

1. **`knowledge/material-sourcing.json`** — the structured source of truth. Per-material
   entries with box/panel price, LF-per-box, factory-direct FOB, landed estimate, domestic
   wholesale, duty stack, lead time, and a verdict. **Every price carries a `provenance`
   field: `"sub"` (given to Ori directly by a subcontractor/supplier) or `"online"`
   (web research).**
2. **`knowledge/sourcing/*.md`** — the human-readable + RAG-answerable copies
   (`01-fence-gate-…`, `02-other-materials-…`, `INDEX.md`). These are what the Knowledge Q&A
   actually retrieves and cites.
3. **MongoDB `knowledgeChunks` collection** (db `contractor`, shared Atlas cluster) — the
   live corpus the app answers from. The `.md` files above are pushed in here via
   `POST /api/knowledge/append` under source **"Material sourcing"**. This is the same store
   as every other knowledge chunk (204+ chunks). Dedupe key = chunk `title`.

So: **JSON = the numbers, MD = the prose, Mongo = what the app answers from.** Re-running the
append with an edited `.md` updates the Mongo chunk in place (same title).

## How to add / update a price

- **A sub gives Ori a new number:** edit the material's `sub` block in `material-sourcing.json`
  (set `provenance: "sub"`, add the sub's name), update the matching `.md` line tagged
  **[SUB]**, then re-append (below). A sub's real quote outranks any web listing.
- **New web research:** update the `online`/`factoryDirectFOB`/`domesticWholesale` blocks +
  the **[ONLINE]** lines. Keep the source URLs and confidence.

## Re-append to the live corpus after editing the .md files

```
# from the contractor folder, app running on :4373
node - <<'JS'
import fs from "node:fs";
const files = [
  ["Material sourcing — fence & gate: import vs domestic", "knowledge/sourcing/01-fence-gate-import-vs-domestic.md"],
  ["Material sourcing — other materials: import vs domestic", "knowledge/sourcing/02-other-materials-import-vs-domestic.md"],
];
const chunks = files.map(([title, path]) => ({
  title, source: "Material sourcing",
  topics: ["material sourcing","import","factory direct","domestic wholesale","tariffs","fence","gate"],
  text: fs.readFileSync(path, "utf8"),
}));
const res = await fetch("http://localhost:4373/api/knowledge/append", {
  method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({chunks}),
});
console.log(await res.json());
JS
```

Check it landed: `curl -s http://localhost:4373/api/knowledge/summary` (look for the
"Material sourcing" source count).

## Standing caveats baked into the data
- A fence "box" = one pre-assembled panel (vinyl/wood ~8 LF, aluminum/composite ~6 LF), not a
  bulk carton. Confirm LF-per-box with the supplier.
- The Excel model `Downloads\Material_Sourcing_and_Lead_Time_Model.xlsx` (Ori's original Google
  research) skipped **duties + freight** — its FOB-vs-domestic gap overstates real savings, and
  it divided every box by 8 (correct for vinyl/wood, understates 6-ft aluminum/composite panels).
- Duties change often — confirm live rates with a customs broker before importing.
