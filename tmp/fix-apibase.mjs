import fs from "fs";
const pages = ["bid_lab.html", "lead_generation.html", "services_board.html", "subcontractor_finder.html", "suppliers.html"];
for (const p of pages) {
  let html = fs.readFileSync(p, "utf8");
  const before = html;
  html = html.replace(/const apiBase = window\.location\.port === "4173"[^\n]*;/g,
    'const apiBase = ""; // single-port since 2026-07-07: /api is same-origin');
  if (html !== before) { fs.writeFileSync(p, html); console.log(p, "fixed"); }
  else console.log(p, "NO MATCH");
}
