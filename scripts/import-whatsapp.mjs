#!/usr/bin/env node
"use strict";

// WhatsApp + phone-contact ingestion for the Joon contractor app.
//
// Run on demand (no watching, no daemon):
//   node scripts/import-whatsapp.mjs <path-to-export.zip-or-folder-or-.vcf> [--project <projectId>] [--contacts-csv <google-contacts.csv>] [--vcf <iphone-contacts.vcf>]
//
// What it does:
//   1. Extracts a WhatsApp "Export Chat > Attach Media" .zip (or reads an
//      already-extracted folder) — finds the chat .txt + photo files inside.
//   2. Uploads each qualifying photo to this app's own Photo Feed via
//      POST /api/photofeed/upload + POST /api/photofeed (projectId scoped),
//      with a caption pulled from the surrounding chat line when findable.
//   3. Parses the chat .txt for distinct phone numbers + sender names and
//      writes/merges knowledge/whatsapp-contacts-extracted.csv for Ori to
//      review — nothing is auto-inserted into the subs database.
//   4. If --contacts-csv points at a Google Contacts export, normalizes it
//      into the same CSV with source=google appended.
//   5. If the input itself is a .vcf, OR --vcf points at one, parses the
//      vCard (iPhone / iCloud "Export Contact" or "Share Contacts") into the
//      same review CSV with source=iphone. This is the direct-from-iPhone
//      path — no Google detour needed.
//
// Provenance: every row carries a `source` column (whatsapp | google | iphone)
// so contacts Ori hands over from his own phone are distinguishable from
// anything sourced online. Promote curated rows into the subs DB as TRUSTED
// (sourcingMethod=ori-personal) with scripts/promote-contacts.mjs — fill the
// `trade` column on the rows you want promoted first.
//
// Zero new npm dependencies: only Node built-ins, global fetch (Node 18+),
// and PowerShell's Expand-Archive (spawned as a child process) to unzip.
// Does not touch server.js, app.html, index*.html, assets, or restart PM2.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(SCRIPT_DIR, "..");
const IMPORT_LOG_PATH = path.join(SCRIPT_DIR, ".import-log.json");
const CONTACTS_CSV_PATH = path.join(PROJECT_ROOT, "knowledge", "whatsapp-contacts-extracted.csv");
const APP_BASE = (process.env.WHATSAPP_IMPORT_APP_URL || "http://localhost:4373").replace(/\/+$/, "");

const IMAGE_MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const MIN_IMAGE_BYTES = 30 * 1024; // skip stickers / thumbnails / junk

// ── CLI args ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { input: null, project: "whatsapp-inbox", contactsCsv: null, vcf: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") out.project = argv[++i];
    else if (a === "--contacts-csv") out.contactsCsv = argv[++i];
    else if (a === "--vcf") out.vcf = argv[++i];
    else if (!out.input) out.input = a;
  }
  return out;
}

function slugifyProject(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "whatsapp-inbox";
}

// ── import log (idempotency by file hash) ───────────────────────────────
function loadImportLog() {
  try {
    return JSON.parse(fs.readFileSync(IMPORT_LOG_PATH, "utf8"));
  } catch (_error) {
    return { uploads: {} };
  }
}

function saveImportLog(log) {
  fs.writeFileSync(IMPORT_LOG_PATH, JSON.stringify(log, null, 2));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ── zip extraction via PowerShell (no npm dep) ──────────────────────────
function isZipFile(p) {
  return fs.statSync(p).isFile() && p.toLowerCase().endsWith(".zip");
}

function extractZip(zipPath) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "whatsapp-import-"));
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${dest}" -Force`
  ]);
  return dest;
}

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

// ── WhatsApp chat .txt parsing ───────────────────────────────────────────
// Supports both common export line formats:
//   iOS:     [7/10/24, 9:14:22 AM] Sender Name: message text
//   Android: 7/10/24, 9:14 AM - Sender Name: message text
const LINE_IOS = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]\s([^:]+):\s(.*)$/;
const LINE_ANDROID = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?:\s?[APap][Mm])?)\s-\s([^:]+):\s(.*)$/;
const ATTACH_IOS = /<attached:\s*([^>]+)>\s*(.*)$/i;
const ATTACH_ANDROID = /^([^\s].*\.(?:jpg|jpeg|png|webp|heic))\s*\(file attached\)\s*$/i;
const PHONE_RE = /(\+?\d[\d\-\s().]{6,}\d)/g;

function isPhoneLike(str) {
  const trimmed = String(str || "").trim();
  if (!/^[+\d][\d\-\s().]*\d$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function normalizePhone(str) {
  const trimmed = String(str || "").trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return (hasPlus ? "+" : "") + digits;
}

function parseTimestamp(dateStr, timeStr) {
  const parsed = new Date(`${dateStr}, ${timeStr}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseChatFile(txtPath) {
  const raw = fs.readFileSync(txtPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const messages = [];
  for (const line of lines) {
    const clean = line.replace(/^﻿/, "").replace(/[‎‏]/g, "");
    const m = LINE_IOS.exec(clean) || LINE_ANDROID.exec(clean);
    if (!m) continue;
    const [, dateStr, timeStr, sender, text] = m;
    messages.push({
      date: parseTimestamp(dateStr, timeStr),
      sender: sender.trim(),
      text: text.trim()
    });
  }
  return messages;
}

// filename (lowercased, basename only) -> { caption, sender, date }
function buildAttachmentIndex(messages) {
  const index = new Map();
  for (const msg of messages) {
    let filename = null;
    let caption = "";
    const iosMatch = ATTACH_IOS.exec(msg.text);
    if (iosMatch) {
      filename = iosMatch[1].trim();
      caption = iosMatch[2].trim();
    } else {
      const androidMatch = ATTACH_ANDROID.exec(msg.text);
      if (androidMatch) filename = androidMatch[1].trim();
    }
    if (!filename) continue;
    const key = path.basename(filename).toLowerCase();
    index.set(key, { caption, sender: msg.sender, date: msg.date });
  }
  return index;
}

function extractContacts(messages, chatName) {
  const map = new Map(); // key -> {name, phone, chat, firstSeen, lastSeen}

  function upsert(name, phone, date) {
    if (!name && !phone) return;
    const key = `${name}|${phone}`;
    const existing = map.get(key);
    if (existing) {
      if (date && (!existing.firstSeen || date < existing.firstSeen)) existing.firstSeen = date;
      if (date && (!existing.lastSeen || date > existing.lastSeen)) existing.lastSeen = date;
    } else {
      map.set(key, { name, phone, chat: chatName, firstSeen: date, lastSeen: date });
    }
  }

  for (const msg of messages) {
    if (isPhoneLike(msg.sender)) {
      upsert("", normalizePhone(msg.sender), msg.date);
    } else if (msg.sender) {
      upsert(msg.sender, "", msg.date);
    }
    // Opportunistically pick up phone numbers mentioned in message bodies
    // (e.g. shared contact numbers), excluding the sender's own number.
    const found = msg.text.match(PHONE_RE) || [];
    for (const candidate of found) {
      if (!isPhoneLike(candidate)) continue;
      const normalized = normalizePhone(candidate);
      if (isPhoneLike(msg.sender) && normalizePhone(msg.sender) === normalized) continue;
      upsert("", normalized, msg.date);
    }
  }

  return [...map.values()];
}

// ── CSV read/write (hand-rolled, quote-aware) ────────────────────────────
// `trade` is a curation column: blank on import; fill it (e.g. "Fencing & Gates")
// on the rows you want promoted into the subs DB as trusted personal contacts.
const CSV_COLUMNS = ["name", "phone", "email", "org", "chat", "firstSeen", "lastSeen", "source", "trade"];

function csvEscape(value) {
  const str = String(value == null ? "" : value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvParseLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function loadExistingCsv() {
  if (!fs.existsSync(CONTACTS_CSV_PATH)) return [];
  const raw = fs.readFileSync(CONTACTS_CSV_PATH, "utf8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const header = csvParseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = csvParseLine(line);
    const row = {};
    header.forEach((col, i) => { row[col] = cells[i] || ""; });
    return row;
  });
}

function mergeContactRows(existingRows, newRows) {
  const map = new Map();
  for (const row of existingRows) {
    const key = `${row.source || ""}|${(row.name || "").toLowerCase()}|${row.phone || ""}|${row.email || ""}`;
    map.set(key, row);
  }
  let added = 0;
  let updated = 0;
  for (const row of newRows) {
    const key = `${row.source || ""}|${(row.name || "").toLowerCase()}|${row.phone || ""}|${row.email || ""}`;
    const existing = map.get(key);
    if (existing) {
      let changed = false;
      if (row.firstSeen && (!existing.firstSeen || row.firstSeen < existing.firstSeen)) { existing.firstSeen = row.firstSeen; changed = true; }
      if (row.lastSeen && (!existing.lastSeen || row.lastSeen > existing.lastSeen)) { existing.lastSeen = row.lastSeen; changed = true; }
      if (changed) updated++;
    } else {
      map.set(key, row);
      added++;
    }
  }
  return { rows: [...map.values()], added, updated };
}

function writeContactsCsv(rows) {
  fs.mkdirSync(path.dirname(CONTACTS_CSV_PATH), { recursive: true });
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((col) => csvEscape(row[col] ?? "")).join(","));
  }
  fs.writeFileSync(CONTACTS_CSV_PATH, lines.join("\n") + "\n");
}

// ── Google Contacts CSV normalization ────────────────────────────────────
function parseGoogleContactsCsv(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const header = csvParseLine(lines[0]);
  const nameIdx = header.findIndex((h) => h.trim().toLowerCase() === "name");
  const givenIdx = header.findIndex((h) => h.trim().toLowerCase() === "given name");
  const familyIdx = header.findIndex((h) => h.trim().toLowerCase() === "family name");
  const orgIdx = header.findIndex((h) => h.trim().toLowerCase() === "organization name");
  const phoneIdxs = header.reduce((acc, h, i) => (/^phone\s*\d*\s*-\s*value$/i.test(h.trim()) ? [...acc, i] : acc), []);
  const emailIdxs = header.reduce((acc, h, i) => (/^e-?mail\s*\d*\s*-\s*value$/i.test(h.trim()) ? [...acc, i] : acc), []);

  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = csvParseLine(line);
    let name = nameIdx >= 0 ? cells[nameIdx] : "";
    if (!name) name = [givenIdx >= 0 ? cells[givenIdx] : "", familyIdx >= 0 ? cells[familyIdx] : ""].filter(Boolean).join(" ");
    const org = orgIdx >= 0 ? cells[orgIdx] : "";
    const phones = phoneIdxs.map((i) => cells[i]).filter(Boolean);
    const emails = emailIdxs.map((i) => cells[i]).filter(Boolean);
    if (!phones.length && !emails.length) {
      if (!name) continue;
      rows.push({ name, phone: "", email: "", org, chat: "", firstSeen: "", lastSeen: "", source: "google" });
      continue;
    }
    const maxLen = Math.max(phones.length, 1);
    for (let i = 0; i < maxLen; i++) {
      rows.push({
        name,
        phone: phones[i] ? normalizePhone(phones[i]) : "",
        email: emails[0] || "",
        org,
        chat: "",
        firstSeen: "",
        lastSeen: "",
        source: "google"
      });
    }
  }
  return rows;
}

// ── vCard (.vcf) normalization — the direct iPhone / iCloud path ──────────
// Handles vCard 3.0 / 4.0 as exported by iOS Contacts ("Share Contact" /
// "Export vCard") and iCloud.com (both emit UTF-8 3.0, no quoted-printable).
// Unfolds RFC-6350 line folding, prefers a mobile/cell number, keeps the first
// email + ORG, and decodes single-line quoted-printable values (older 2.1
// exports); multi-line QP soft-wraps are not reassembled — not a case iOS/iCloud
// produce, but if you feed a hand-crafted 2.1 file a QP-wrapped name may truncate.
function decodeQuotedPrintable(value) {
  if (!/=[0-9A-Fa-f]{2}/.test(value)) return value;
  const joined = value.replace(/=\r?\n/g, "");
  try {
    const bytes = [];
    for (let i = 0; i < joined.length; i++) {
      if (joined[i] === "=" && /[0-9A-Fa-f]{2}/.test(joined.slice(i + 1, i + 3))) {
        bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(joined.charCodeAt(i));
      }
    }
    return Buffer.from(bytes).toString("utf8");
  } catch (_error) {
    return joined;
  }
}

function parseVcardValue(rawLine) {
  const colon = rawLine.indexOf(":");
  if (colon < 0) return null;
  const head = rawLine.slice(0, colon);
  let value = rawLine.slice(colon + 1);
  const parts = head.split(";");
  // Strip any group prefix (e.g. "item1.TEL" -> "TEL")
  const nameToken = parts[0].includes(".") ? parts[0].split(".").pop() : parts[0];
  const name = nameToken.toUpperCase();
  const params = parts.slice(1).map((p) => p.toLowerCase());
  if (params.some((p) => p.includes("quoted-printable"))) value = decodeQuotedPrintable(value);
  return { name, params, value: value.trim() };
}

function parseVcards(vcfPath) {
  const raw = fs.readFileSync(vcfPath, "utf8");
  // Unfold: a line starting with a space or tab continues the previous line.
  const unfolded = raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const lines = unfolded.split(/\n/);

  const rows = [];
  let card = null;
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") { card = { fn: "", n: "", org: "", phones: [], emails: [] }; continue; }
    if (upper === "END:VCARD") {
      if (card) {
        let name = card.fn;
        if (!name && card.n) {
          const [family, given] = card.n.split(";");
          name = [given, family].filter(Boolean).join(" ").trim();
        }
        const phone = card.phones.find((p) => p.mobile) || card.phones[0];
        if (name || phone || card.emails[0]) {
          rows.push({
            name: name || "",
            phone: phone ? normalizePhone(phone.value) : "",
            email: (card.emails[0] || "").toLowerCase(),
            org: card.org || "",
            chat: "",
            firstSeen: "",
            lastSeen: "",
            source: "iphone",
            trade: ""
          });
        }
      }
      card = null;
      continue;
    }
    if (!card) continue;
    const prop = parseVcardValue(line);
    if (!prop) continue;
    if (prop.name === "FN") card.fn = prop.value;
    else if (prop.name === "N") card.n = prop.value;
    else if (prop.name === "ORG") card.org = prop.value.replace(/;+$/, "").replace(/;/g, " ").trim();
    else if (prop.name === "TEL" && prop.value) {
      card.phones.push({ value: prop.value, mobile: prop.params.some((p) => /cell|mobile|iphone/.test(p)) });
    } else if (prop.name === "EMAIL" && prop.value) {
      card.emails.push(prop.value);
    }
  }
  return rows;
}

// ── Photo upload ──────────────────────────────────────────────────────────
async function uploadPhoto(buffer, projectId, filename) {
  const mime = IMAGE_MIME[path.extname(filename).toLowerCase()] || "image/jpeg";
  const res = await fetch(`${APP_BASE}/api/photofeed/upload?projectId=${encodeURIComponent(projectId)}&name=${encodeURIComponent(path.basename(filename, path.extname(filename)))}`, {
    method: "POST",
    headers: { "Content-Type": mime },
    body: buffer
  });
  if (!res.ok) throw new Error(`upload failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function createFeedEntry({ projectId, photoUrl, caption, takenAt }) {
  const res = await fetch(`${APP_BASE}/api/photofeed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      projectName: projectId,
      photoUrl,
      caption: caption || "",
      tags: ["whatsapp"],
      phase: "other",
      takenAt: takenAt || new Date().toISOString()
    })
  });
  if (!res.ok) throw new Error(`feed entry failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: node scripts/import-whatsapp.mjs <path-to-export.zip-or-folder-or-.vcf> [--project <projectId>] [--contacts-csv <google-contacts.csv>] [--vcf <iphone-contacts.vcf>]");
    process.exit(1);
  }

  const projectId = slugifyProject(args.project);
  const inputPath = path.resolve(process.cwd(), args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }

  // Direct iPhone / iCloud path: the input itself is a vCard export.
  if (fs.statSync(inputPath).isFile() && inputPath.toLowerCase().endsWith(".vcf")) {
    const vcardRows = parseVcards(inputPath);
    const existing = loadExistingCsv();
    const { rows, added, updated } = mergeContactRows(existing, vcardRows);
    writeContactsCsv(rows);
    console.log(`iPhone contacts (.vcf): ${added} added, ${updated} updated (${vcardRows.length} parsed from ${path.basename(inputPath)}).`);
    console.log(`-> ${path.relative(PROJECT_ROOT, CONTACTS_CSV_PATH)}`);
    console.log(`Next: fill the "trade" column on the real subs, then run  node scripts/promote-contacts.mjs`);
    return;
  }

  // Direct Google-Contacts path: the input itself is a Google Contacts .csv export.
  if (fs.statSync(inputPath).isFile() && inputPath.toLowerCase().endsWith(".csv")) {
    const googleRows = parseGoogleContactsCsv(inputPath);
    const existing = loadExistingCsv();
    const { rows, added, updated } = mergeContactRows(existing, googleRows);
    writeContactsCsv(rows);
    console.log(`Google contacts (.csv): ${added} added, ${updated} updated (${googleRows.length} parsed from ${path.basename(inputPath)}).`);
    console.log(`-> ${path.relative(PROJECT_ROOT, CONTACTS_CSV_PATH)}`);
    console.log(`Next: fill the "trade" column on the real subs, then run  node scripts/promote-contacts.mjs`);
    return;
  }

  let workDir = inputPath;
  let isTempDir = false;
  if (isZipFile(inputPath)) {
    console.log(`Extracting ${inputPath} ...`);
    workDir = extractZip(inputPath);
    isTempDir = true;
  } else if (!fs.statSync(inputPath).isDirectory()) {
    console.error("Input must be a .zip file or a folder.");
    process.exit(1);
  }

  const allFiles = walkFiles(workDir);
  const txtFiles = allFiles.filter((f) => f.toLowerCase().endsWith(".txt"));
  const imageFiles = allFiles.filter((f) => Object.keys(IMAGE_MIME).includes(path.extname(f).toLowerCase()));

  if (!txtFiles.length) console.warn("No chat .txt file found in the export — contact extraction and caption matching will be skipped.");

  const chatTxtPath = txtFiles[0] || null;
  const chatName = chatTxtPath ? path.basename(chatTxtPath, ".txt") : "whatsapp";
  const messages = chatTxtPath ? parseChatFile(chatTxtPath) : [];
  const attachmentIndex = buildAttachmentIndex(messages);

  // ── Photo upload ──
  const importLog = loadImportLog();
  importLog.uploads = importLog.uploads || {};

  let uploaded = 0;
  let skippedSmall = 0;
  let skippedDuplicate = 0;
  const createdEntries = [];

  for (const filePath of imageFiles) {
    const base = path.basename(filePath);
    if (/sticker/i.test(base)) { skippedSmall++; continue; }
    const stat = fs.statSync(filePath);
    if (stat.size < MIN_IMAGE_BYTES) { skippedSmall++; continue; }

    const buffer = fs.readFileSync(filePath);
    const hash = sha256(buffer);
    const logKey = `${projectId}:${hash}`;
    if (importLog.uploads[logKey]) { skippedDuplicate++; continue; }

    const attach = attachmentIndex.get(base.toLowerCase());
    const caption = attach ? attach.caption : "";
    const takenAt = attach ? attach.date : null;

    const uploadResult = await uploadPhoto(buffer, projectId, base);
    const entry = await createFeedEntry({ projectId, photoUrl: uploadResult.url, caption, takenAt });

    importLog.uploads[logKey] = {
      url: uploadResult.url,
      feedEntryId: entry.id,
      projectId,
      filename: base,
      uploadedAt: new Date().toISOString()
    };
    createdEntries.push(entry);
    uploaded++;
  }
  saveImportLog(importLog);

  // ── Contact extraction ──
  let contactSummary = { added: 0, updated: 0, total: 0 };
  if (messages.length) {
    const extracted = extractContacts(messages, chatName);
    const existing = loadExistingCsv();
    const { rows, added, updated } = mergeContactRows(existing, extracted.map((r) => ({ ...r, source: "whatsapp" })));
    writeContactsCsv(rows);
    contactSummary = { added, updated, total: rows.length };
  }

  // ── iPhone / iCloud vCard (optional, alongside a chat export) ──
  if (args.vcf) {
    const vcfPath = path.resolve(process.cwd(), args.vcf);
    if (!fs.existsSync(vcfPath)) {
      console.warn(`--vcf path not found: ${vcfPath}`);
    } else {
      const vcardRows = parseVcards(vcfPath);
      const existing = loadExistingCsv();
      const { rows, added, updated } = mergeContactRows(existing, vcardRows);
      writeContactsCsv(rows);
      console.log(`iPhone contacts (.vcf): ${added} added, ${updated} updated (${vcardRows.length} parsed from ${path.basename(vcfPath)}).`);
    }
  }

  // ── Google Contacts CSV (optional) ──
  if (args.contactsCsv) {
    const googlePath = path.resolve(process.cwd(), args.contactsCsv);
    if (!fs.existsSync(googlePath)) {
      console.warn(`--contacts-csv path not found: ${googlePath}`);
    } else {
      const googleRows = parseGoogleContactsCsv(googlePath);
      const existing = loadExistingCsv();
      const { rows, added, updated } = mergeContactRows(existing, googleRows);
      writeContactsCsv(rows);
      console.log(`Google Contacts: ${added} added, ${updated} updated (${googleRows.length} parsed from ${path.basename(googlePath)}).`);
    }
  }

  if (isTempDir) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  console.log("");
  console.log(`Project: ${projectId}`);
  console.log(`Photos uploaded: ${uploaded}`);
  console.log(`Photos skipped (sticker/too small): ${skippedSmall}`);
  console.log(`Photos skipped (already imported): ${skippedDuplicate}`);
  console.log(`Contacts CSV: ${contactSummary.added} added, ${contactSummary.updated} updated (${contactSummary.total} total rows) -> ${path.relative(PROJECT_ROOT, CONTACTS_CSV_PATH)}`);
  if (createdEntries.length) {
    console.log("Created photo feed entry IDs: " + createdEntries.map((e) => e.id).join(", "));
  }
}

main().catch((error) => {
  console.error("Import failed:", error.message);
  process.exit(1);
});
