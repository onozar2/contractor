const express = require("express");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const publicApp = express();
const crmApp = express();
const app = crmApp;
const publicPort = process.env.PUBLIC_PORT || process.env.PORT || 4173;
const crmPort = process.env.CRM_PORT || 4373;
const mongoUri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "contractor";

let clientPromise;

publicApp.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
publicApp.get("/index.html", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
publicApp.get("/flyer_services.html", (_req, res) => res.sendFile(path.join(__dirname, "flyer_services.html")));
publicApp.get("/flyer_commercial.html", (_req, res) => res.sendFile(path.join(__dirname, "flyer_commercial.html")));
publicApp.get("/market_report.html", (_req, res) => res.sendFile(path.join(__dirname, "market_report.html")));
publicApp.use("/assets", express.static(path.join(__dirname, "assets")));

crmApp.use(express.json({ limit: "1mb" }));
crmApp.get("/", (_req, res) => res.redirect("/subcontractor_finder.html"));
crmApp.get("/subcontractor_finder.html", (_req, res) => res.sendFile(path.join(__dirname, "subcontractor_finder.html")));
crmApp.get("/lead_generation.html", (_req, res) => res.sendFile(path.join(__dirname, "lead_generation.html")));
crmApp.get("/bid_lab.html", (_req, res) => res.sendFile(path.join(__dirname, "bid_lab.html")));
crmApp.use("/assets", express.static(path.join(__dirname, "assets")));

function getClient() {
  if (!mongoUri) return null;
  if (!clientPromise) {
    const client = new MongoClient(mongoUri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

async function collection(name = "subcontractors") {
  const client = await getClient();
  if (!client) return null;
  return client.db(dbName).collection(name);
}

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanString).filter(Boolean))];
}

function cleanList(value) {
  if (Array.isArray(value)) return cleanArray(value);
  return cleanString(value).split(/\n|,/).map(cleanString).filter(Boolean);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function daysUntilDate(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  if (Number.isNaN(time)) return null;
  return Math.round((time - Date.now()) / 86400000);
}

function computeOwnerReachScore(doc) {
  let s = 0;
  if (cleanString(doc.ownerName)) s += 45;
  if (cleanString(doc.email)) s += 25;
  if (cleanString(doc.phone)) s += 20;
  if (cleanString(doc.ownerTitle)) s += 5;
  if (cleanString(doc.licenseNumber)) s += 5;
  return clamp(Math.round(s), 0, 100);
}

function scoreSubcontractor(input) {
  const rating = Number(input.reviewRating || 0);
  const reviewCount = Number(input.reviewCount || 0);
  const sentiment = cleanString(input.sentiment).toLowerCase();
  const sourceConfidence = cleanString(input.sourceConfidence || "medium").toLowerCase();
  const bondedStatus = cleanString(input.bondedStatus || "unknown").toLowerCase();
  let score = 35;

  if (rating > 0) score += clamp((rating - 3) * 16, -20, 32);
  score += clamp(Math.log10(reviewCount + 1) * 7, 0, 16);
  if (sentiment === "positive") score += 12;
  if (sentiment === "mixed") score += 3;
  if (sentiment === "negative") score -= 14;
  if (cleanString(input.phone)) score += 5;
  if (cleanString(input.email)) score += 5;
  if (cleanString(input.website)) score += 4;
  if (input.licenseVerified) score += 8;
  if (input.insuranceVerified) score += 5;
  if (input.additionalInsured) score += 4;
  const insExpiry = daysUntilDate(input.insuranceExpiresAt);
  if (insExpiry !== null) score += insExpiry < 0 ? -14 : insExpiry <= 30 ? -5 : 5;
  const licExpiry = daysUntilDate(input.licenseExpiresAt);
  if (licExpiry !== null) score += licExpiry < 0 ? -10 : licExpiry <= 30 ? -3 : 3;
  if (/bonded|verified|active|yes/.test(bondedStatus)) score += 4;
  if (/active|verified|current/i.test(input.workersCompStatus || "")) score += 4;
  if (/active|verified|current/i.test(input.generalLiabilityStatus || "")) score += 4;
  if (/supplier_referral|job_site|permit_data|sub_referral/i.test(input.sourceChannel || "")) score += 8;
  if (/net_30_verified|good_standing/i.test(input.net30Status || "")) score += 6;
  if (/cash_only/i.test(input.net30Status || "")) score -= 6;
  if (cleanString(input.fieldSupervisor)) score += 3;
  if (cleanString(input.recentProjects)) score += 4;
  if (cleanString(input.lienHistoryNotes) && !/none|clear|not found/i.test(input.lienHistoryNotes)) score -= 5;
  if (/preferred|qualified|outreach_ready/i.test(input.chaseState || "")) score += 6;
  if (sourceConfidence === "high") score += 8;
  if (sourceConfidence === "low") score -= 7;
  if (cleanArray(input.specialties).length >= 2) score += 4;
  if (cleanString(input.ownerName)) score += 4;
  if (cleanString(input.reachTier) === "owner") score += 10;
  if (cleanString(input.ownerReachConfidence).toLowerCase() === "high") score += 4;

  return clamp(Math.round(score), 0, 100);
}

function normalize(input) {
  const doc = {
    companyName: cleanString(input.companyName),
    contactName: cleanString(input.contactName),
    phone: cleanString(input.phone),
    email: cleanString(input.email).toLowerCase(),
    website: cleanString(input.website),
    linkedIn: cleanString(input.linkedIn),
    ownerName: cleanString(input.ownerName || input.contactName),
    ownerTitle: cleanString(input.ownerTitle),
    ownerReachConfidence: cleanString(input.ownerReachConfidence || "").toLowerCase(),
    ownerReachEvidence: cleanString(input.ownerReachEvidence),
    serviceCategory: cleanString(input.serviceCategory),
    specialties: cleanList(input.specialties),
    serviceArea: cleanString(input.serviceArea || "Southern California"),
    sourceChannel: cleanString(input.sourceChannel || input.sourcingMethod || "manual"),
    referralSource: cleanString(input.referralSource),
    supplierName: cleanString(input.supplierName),
    jobSiteAddress: cleanString(input.jobSiteAddress),
    permitJurisdiction: cleanString(input.permitJurisdiction),
    permitReference: cleanString(input.permitReference),
    crewSize: cleanString(input.crewSize),
    fieldSupervisor: cleanString(input.fieldSupervisor),
    net30Status: cleanString(input.net30Status || "unknown"),
    unionStatus: cleanString(input.unionStatus || "unknown"),
    responsivenessScore: Number(input.responsivenessScore || 0),
    qualityScore: Number(input.qualityScore || 0),
    minimumJobSize: cleanString(input.minimumJobSize),
    unitPriceNotes: cleanString(input.unitPriceNotes),
    laborRateHints: cleanString(input.laborRateHints),
    mobilizationFee: cleanString(input.mobilizationFee),
    typicalQuoteTurnaround: cleanString(input.typicalQuoteTurnaround),
    bidInputRequirements: cleanString(input.bidInputRequirements),
    pricingExclusions: cleanString(input.pricingExclusions),
    quoteConfidence: cleanString(input.quoteConfidence || "unknown"),
    licenseNumber: cleanString(input.licenseNumber),
    licenseClass: cleanString(input.licenseClass || input.licenseType),
    licenseType: cleanString(input.licenseType || input.licenseClass),
    licenseSourceUrl: cleanString(input.licenseSourceUrl),
    licenseSourceNotes: cleanString(input.licenseSourceNotes),
    licenseLastCheckedAt: cleanString(input.licenseLastCheckedAt),
    workersCompStatus: cleanString(input.workersCompStatus),
    generalLiabilityStatus: cleanString(input.generalLiabilityStatus),
    bondedStatus: cleanString(input.bondedStatus || "unknown"),
    dirRegistrationStatus: cleanString(input.dirRegistrationStatus),
    insuranceExpiresAt: cleanString(input.insuranceExpiresAt),
    licenseExpiresAt: cleanString(input.licenseExpiresAt),
    additionalInsured: Boolean(input.additionalInsured),
    recentProjects: cleanString(input.recentProjects),
    projectPhotos: cleanList(input.projectPhotos),
    lienHistoryNotes: cleanString(input.lienHistoryNotes),
    vettingStatus: cleanString(input.vettingStatus || (input.licenseVerified ? "license_checked" : "needs_vetting")),
    licenseVerified: Boolean(input.licenseVerified),
    insuranceVerified: Boolean(input.insuranceVerified),
    reviewRating: Number(input.reviewRating || 0),
    reviewCount: Number(input.reviewCount || 0),
    reviewSource: cleanString(input.reviewSource),
    sentiment: cleanString(input.sentiment || "unknown"),
    priceTier: cleanString(input.priceTier || "unknown"),
    summary: cleanString(input.summary),
    sourceUrls: cleanList(input.sourceUrls),
    sourceNotes: cleanString(input.sourceNotes),
    sourceConfidence: cleanString(input.sourceConfidence || "medium"),
    sourcingMethod: cleanString(input.sourcingMethod || "manual"),
    sourcingRunId: cleanString(input.sourcingRunId),
    agentStatus: cleanString(input.agentStatus || "needs_review"),
    chaseState: cleanString(input.chaseState || input.status || "new"),
    nextFollowUpAt: cleanString(input.nextFollowUpAt),
    lastContactedAt: cleanString(input.lastContactedAt),
    chaseNotes: cleanString(input.chaseNotes),
    status: cleanString(input.status || "researching"),
    lastResearchedAt: input.lastResearchedAt || new Date().toISOString()
  };
  const hasChannel = Boolean(doc.phone || doc.email);
  doc.reachTier = doc.ownerName && hasChannel ? "owner" : hasChannel ? "company" : "none";
  const providedReach = Number(input.ownerReachScore);
  doc.ownerReachScore = Number.isFinite(providedReach) && providedReach > 0
    ? clamp(Math.round(providedReach), 0, 100)
    : computeOwnerReachScore(doc);
  if (!doc.ownerReachConfidence) {
    if (doc.ownerReachScore >= 75) doc.ownerReachConfidence = "high";
    else if (doc.ownerReachScore >= 45) doc.ownerReachConfidence = "medium";
    else doc.ownerReachConfidence = "low";
  }
  doc.fitScore = scoreSubcontractor(doc);
  return doc;
}

function buildSubcontractorChaseTask(record, mode = "both") {
  const contact = record.contactName || "there";
  const company = record.companyName || "your company";
  const trade = record.serviceCategory || "construction";
  const sourceContext = [
    record.supplierName ? `supplier referral from ${record.supplierName}` : "",
    record.jobSiteAddress ? `job-site observation at ${record.jobSiteAddress}` : "",
    record.permitReference ? `permit/project reference ${record.permitReference}` : "",
    record.referralSource ? `referral from ${record.referralSource}` : "",
    record.net30Status && record.net30Status !== "unknown" ? `supplier account signal: ${record.net30Status}` : "",
    record.sourceChannel && record.sourceChannel !== "manual" ? `source channel: ${record.sourceChannel}` : ""
  ].filter(Boolean).join("; ");
  const opener = sourceContext
    ? `I came across ${company} through ${sourceContext}.`
    : `I came across ${company} while building our subcontractor roster for Southern California work.`;
  const subject = `Subcontractor roster - ${trade}`;
  const emailBody = [
    `Hi ${contact.split(/\s+/)[0] || "there"},`,
    "",
    `${opener} My name is Ori Nozar with Joon Development Group. We are building a short list of reliable ${trade} partners for upcoming Los Angeles / Southern California projects.`,
    "",
    "Are you open to being considered for our bid/field partner roster? If so, I would like to understand your service area, crew capacity, best estimating contact, CSLB license, and insurance/COI status.",
    "",
    "No pressure if you are full right now. I am mainly trying to build a quality roster of subs who communicate well, are properly licensed/insured, and can be a long-term fit.",
    "",
    "Best,",
    "Ori Nozar",
    "(818) 371-0334"
  ].join("\n");
  const phoneScript = [
    `Hi ${contact.split(/\s+/)[0] || "there"}, this is Ori Nozar with Joon Development Group.`,
    "I know I am calling out of the blue, so I will be brief.",
    opener,
    `We are building a vetted roster of ${trade} subcontractors for Southern California projects.`,
    "Do you take on work from GCs or owner-builders, and who is the best person for estimates?",
    "",
    "Questions to cover:",
    "1. What areas do you cover?",
    "2. What scope do you prefer and avoid?",
    "3. How many people are usually in the field crew?",
    "4. Who supervises field work day to day?",
    "5. Is your CSLB license active, and can you provide COI/workers comp if we request it?",
    "6. What is the best way to send plans or a scope?",
    "7. What photos, measurements, or drawings do you need to give a budget number within 24-48 hours?",
    "8. Are you bonded, and is there anything we should verify before adding you to our preferred roster?"
  ].join("\n");
  return {
    subcontractorId: record._id?.toString?.() || record.id || "",
    mode,
    subject,
    emailBody,
    phoneScript,
    followUpPlan: "If no response, follow up in 5 business days. If they answer, mark responded and request license/COI plus preferred bid email.",
    sourceContext
  };
}

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueMatches(text, regex, limit = 8) {
  const matches = [];
  let match;
  while ((match = regex.exec(text)) && matches.length < limit) {
    matches.push(cleanString(match[0]));
  }
  return [...new Set(matches)];
}

function inferSentiment(text) {
  const positive = ["excellent", "professional", "responsive", "quality", "recommended", "reliable", "on time", "honest", "great"];
  const negative = ["complaint", "late", "unresponsive", "poor", "bad", "lawsuit", "delay", "over budget", "terrible"];
  const lower = text.toLowerCase();
  const positives = positive.filter((word) => lower.includes(word)).length;
  const negatives = negative.filter((word) => lower.includes(word)).length;
  if (positives > negatives + 1) return "positive";
  if (negatives > positives) return "negative";
  if (positives || negatives) return "mixed";
  return "unknown";
}

function inferPriceTier(text) {
  const lower = text.toLowerCase();
  if (lower.includes("premium") || lower.includes("luxury") || lower.includes("high-end")) return "$$$";
  if (lower.includes("affordable") || lower.includes("budget") || lower.includes("low cost")) return "$";
  if (lower.includes("free estimate") || lower.includes("competitive")) return "$$";
  return "unknown";
}

function inferBondedStatus(text) {
  const lower = cleanString(text).toLowerCase();
  if (/\bnot\s+bonded\b/.test(lower)) return "not_bonded";
  if (/\bbonded\b|\bbondable\b/.test(lower)) return "bonded";
  return "unknown";
}

function extractRating(text) {
  const ratingMatch = text.match(/([1-5](?:\.\d)?)\s*(?:out of\s*)?5\s*(?:stars?|rating)?/i) || text.match(/rating[:\s]+([1-5](?:\.\d)?)/i);
  const countMatch = text.match(/([\d,]+)\s*(?:reviews?|ratings?)/i);
  return {
    reviewRating: ratingMatch ? Number(ratingMatch[1]) : 0,
    reviewCount: countMatch ? Number(countMatch[1].replace(/,/g, "")) : 0
  };
}

function extractLicenseDetails(text) {
  const cleaned = cleanString(text);
  const licensePatterns = [
    /\b(?:CSLB|contractor'?s?\s+license|license|lic\.?|CA\s+license|California\s+license)\s*(?:no\.?|number|#|:)?\s*([0-9]{6,8})\b/ig,
    /\b(?:CSLB|lic\.?)\s*#?\s*([0-9]{6,8})\b/ig
  ];
  const licenseNumbers = [];
  for (const pattern of licensePatterns) {
    let match;
    while ((match = pattern.exec(cleaned)) && licenseNumbers.length < 5) {
      licenseNumbers.push(match[1]);
    }
  }
  const classMatch = cleaned.match(/\b(?:class|classification)\s*(?:-|:)?\s*((?:A|B|C)(?:[- ]?\d{1,2})?(?:\s*[-/]\s*[A-Za-z][A-Za-z ]{2,36})?)/i);
  const statusMatch = cleaned.match(/\b(active|current|inactive|expired|suspended|revoked)\b/i);
  return {
    licenseNumber: [...new Set(licenseNumbers)][0] || "",
    licenseClass: classMatch ? cleanString(classMatch[1]).toUpperCase() : "",
    licenseType: classMatch ? cleanString(classMatch[1]).toUpperCase() : "",
    licenseStatusText: statusMatch ? cleanString(statusMatch[1]).toLowerCase() : "",
    found: Boolean(licenseNumbers.length)
  };
}

function extractOwnerName(text) {
  const clean = cleanString(text);
  const patterns = [
    /\b(?:owner|founder|co-?founder|president|principal|proprietor|owned\s+and\s+operated\s+by|founded\s+by|owned\s+by)\s*(?:&|and|\/|is|:|-)?\s*(?:owner|operator)?\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/,
    /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+),?\s+(?:the\s+)?(?:owner|founder|president|principal|proprietor)\b/
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m && m[1]) {
      const name = cleanString(m[1]);
      if (name.split(/\s+/).length >= 2 && name.length <= 40) {
        const titleM = clean.match(/\b(owner|founder|co-?founder|president|principal|proprietor)\b/i);
        return { name, title: titleM ? cleanString(titleM[1]) : "Owner" };
      }
    }
  }
  return { name: "", title: "" };
}

function parseResearchPage(url, html) {
  const title = cleanString((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const meta = cleanString((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1]);
  const text = textFromHtml(html);
  const phones = uniqueMatches(text, /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g);
  const emails = uniqueMatches(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  const rating = extractRating(text);
  const license = extractLicenseDetails(text);
  const owner = extractOwnerName(text);
  const summary = cleanString(meta || text.slice(0, 260));
  const reviewSource = sourceTypeForUrl(url);
  const hasChannel = Boolean(phones[0] || emails[0]);

  return {
    companyName: title.replace(/\s*[-|].*$/, ""),
    ownerName: owner.name,
    ownerTitle: owner.title,
    phone: phones[0] || "",
    email: emails[0] || "",
    website: url,
    licenseNumber: license.licenseNumber,
    licenseClass: license.licenseClass,
    licenseType: license.licenseType,
    licenseVerified: license.found,
    bondedStatus: inferBondedStatus(text),
    reviewRating: rating.reviewRating,
    reviewCount: rating.reviewCount,
    reviewSource,
    sentiment: inferSentiment(text),
    priceTier: inferPriceTier(text),
    summary,
    sourceUrls: [url],
    sourceNotes: `Imported from ${reviewSource}. Found ${phones.length} phone(s), ${emails.length} email(s), owner ${owner.name || "not found"}, license ${license.licenseNumber || "not found"}, rating ${rating.reviewRating || "not found"}, reviews ${rating.reviewCount || "not found"}.`,
    sourceConfidence: (owner.name && hasChannel) || license.found ? "high" : (hasChannel || rating.reviewRating ? "medium" : "low"),
    pageTextSample: text.slice(0, 1800)
  };
}

function decodeEntities(value) {
  return cleanString(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeDuckUrl(url) {
  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.href;
  } catch (_error) {
    return url;
  }
}

async function fetchHtml(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "JoonSourcingAgent/1.0 (+source-backed local CRM)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const html = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWeb(query, limit = 6) {
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl, 12000);
  const results = [];
  const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = resultRegex.exec(html)) && results.length < limit) {
    const url = decodeDuckUrl(decodeEntities(match[1]));
    if (!/^https?:\/\//i.test(url)) continue;
    results.push({
      title: decodeEntities(textFromHtml(match[2])),
      url,
      snippet: decodeEntities(textFromHtml(match[3])),
      searchUrl
    });
  }

  if (!results.length) {
    const fallbackRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = fallbackRegex.exec(html)) && results.length < limit) {
      const url = decodeDuckUrl(decodeEntities(match[1]));
      if (!/^https?:\/\//i.test(url)) continue;
      results.push({ title: decodeEntities(textFromHtml(match[2])), url, snippet: "", searchUrl });
    }
  }
  return results;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
}

function companyFromResult(result) {
  return cleanString(result.title.replace(/\s*[-|].*$/, "").replace(/\s+\|?\s*(Yelp|Angi|HomeAdvisor|BBB|LinkedIn).*$/i, ""));
}

function sourceTypeForUrl(url) {
  const host = hostname(url);
  if (host.includes("yelp")) return "Yelp";
  if (host.includes("angi")) return "Angi";
  if (host.includes("homeadvisor")) return "HomeAdvisor";
  if (host.includes("bbb")) return "BBB";
  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("craigslist")) return "Craigslist";
  return host || "Public web";
}

function isBlockedSubcontractorSource(url, title = "", snippet = "") {
  const host = hostname(url);
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch (_error) {
      return "";
    }
  })();
  const text = `${title} ${snippet} ${url}`.toLowerCase();
  if (host.includes("duckduckgo.com") && /\/y\.js|ad_domain|ad_provider|aclick/.test(`${path} ${text}`)) return true;
  const blockedHosts = [
    "careerjet.com",
    "indeed.com",
    "monster.com",
    "jooble.org",
    "simplyhired.com",
    "arcgis.com",
    "clca.org",
    "clca-lasgv.org",
    "ua345.org",
    "dir.ca.gov",
    "ladwp.com",
    "lacity.org",
    "lacitydbs.org",
    "permitla.org",
    "dbs.lacity.gov",
    "engpermits.lacity.org",
    "bca.lacity.gov",
    "permitgrab.com",
    "subcontractorfinder.com",
    "firstchoicelandscapesupply.com",
    "patagoniabuildingsupplies.com",
    "expertise.com",
    "thehomeatlas.com",
    "craigslist.org"
  ];
  if (blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return true;
  if (host.includes("linkedin.com") && !path.startsWith("/company/")) return true;
  if (host.includes("yelp.com") && !path.startsWith("/biz")) return true;
  if (host.includes("angi.com") && /\/search|category-/.test(path)) return true;
  if (host.includes("houzz.com") && /(photos|ideabooks)/.test(path)) return true;
  if (host.includes("bbb.org") && /\/category\/|\/search/.test(path)) return true;
  if (host.includes("facebook.com") && /(marketplace|\/jobs|\/groups|\/events|category)/.test(path)) return true;
  return /\b(top\s+10|best\s+15|jobs?\s+board|employment|now hiring|preferred vendors|vendors and bidders|permit portal|permit and inspection|landscape supply|building supplies|buying group|local union|public works contractors|directory of)\b/i.test(text);
}

function validateSubcontractorCandidate(result, enriched, serviceCategory, market) {
  const host = hostname(result.url);
  const searchable = cleanString([
    result.title,
    result.snippet,
    enriched.companyName,
    enriched.summary,
    enriched.sourceNotes,
    enriched.pageTextSample
  ].join(" "));
  const lower = searchable.toLowerCase();
  if (isBlockedSubcontractorSource(result.url, result.title, result.snippet)) {
    return { ok: false, reason: "Skipped non-contractor source category." };
  }

  const contractorTerms = /\b(contractor|subcontractor|construction|builder|remodel(?:er|ing)?|renovation|licensed|cslb|general contractor|landscape contractor|drainage contractor|masonry|electric(?:al|ian)?|plumb(?:ing|er)?|hvac|roof(?:ing|er)?|drywall|framing|flooring|tile|waterproofing|concrete|hardscape|painting|cabinetry|millwork|windows?|doors?)\b/i;
  const negativeTerms = /\b(job board|apply now|employment|hiring|association|union|wholesale supplier|supplier directory|directory|marketplace|top 10|best 15|search results|government portal|permit portal|vendor portal)\b/i;
  const serviceWords = cleanString(serviceCategory)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5 && !["remodels", "renovations", "contractor", "subcontractor"].includes(word));
  const hasTradeEvidence = !serviceWords.length || serviceWords.some((word) => lower.includes(word));
  const hasContractorEvidence = contractorTerms.test(searchable);
  const hasContactEvidence = Boolean(enriched.phone || enriched.email || enriched.licenseNumber);
  const isLinkedInCompany = host.includes("linkedin.com") && /\/company\//i.test(result.url);
  const isPlatformProfile = isLinkedInCompany
    || (host.includes("yelp.com") && /\/biz\//i.test(result.url))
    || host.includes("angi.com")
    || host.includes("bbb.org")
    || host.includes("facebook.com")
    || host.includes("instagram.com")
    || host.includes("houzz.com");
  const marketWords = cleanString(market).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
  const hasMarketEvidence = !marketWords.length || marketWords.some((word) => lower.includes(word)) || /southern california|los angeles|greater la|ventura|orange county|san fernando|pasadena|glendale|santa monica|beverly hills/i.test(searchable);

  if (negativeTerms.test(searchable) && !isPlatformProfile) {
    return { ok: false, reason: "Skipped page with directory/job/supplier language." };
  }
  if (!hasContractorEvidence || !hasTradeEvidence) {
    return { ok: false, reason: "Skipped because fetched page did not show contractor/trade evidence." };
  }
  if (!hasContactEvidence && !isPlatformProfile) {
    return { ok: false, reason: "Skipped because page did not expose phone, email, or license evidence." };
  }
  if (!hasMarketEvidence) {
    return { ok: false, reason: "Skipped because page did not show market/service-area evidence." };
  }

  const method = isLinkedInCompany
    ? "Verified against LinkedIn company profile text."
    : enriched.licenseNumber
      ? "Verified against fetched website text with license evidence."
      : "Verified against fetched contractor website text with contact evidence.";
  return { ok: true, method };
}

function mergeUrls(...groups) {
  return [...new Set(groups.flat().map(cleanString).filter(Boolean))];
}

async function enrichPublicResult(result) {
  try {
    const html = await fetchHtml(result.url, 9000);
    const parsed = parseResearchPage(result.url, html);
    return {
      ...parsed,
      sourceNotes: cleanString([parsed.sourceNotes, `Fetched and parsed ${hostname(result.url) || result.url}.`].join(" "))
    };
  } catch (error) {
    return {
      companyName: companyFromResult(result),
      website: result.url,
      summary: result.snippet,
      sourceUrls: [result.url],
      sourceNotes: `Search result from ${sourceTypeForUrl(result.url)}. Page fetch blocked or unavailable: ${error.message}.`,
      sourceConfidence: "low"
    };
  }
}

async function findSubcontractorLicense(record) {
  const companyName = cleanString(record.companyName);
  const serviceArea = cleanString(record.serviceArea || "Los Angeles CA");
  if (!companyName) return { found: false, sourceNotes: "No company name available for license search." };

  const queries = [
    `"${companyName}" CSLB license`,
    `"${companyName}" contractor license ${serviceArea}`,
    `site:cslb.ca.gov "${companyName}"`,
    record.website ? `"${companyName}" "${hostname(record.website)}" license` : ""
  ].filter(Boolean);

  const seen = new Set();
  for (const query of queries) {
    const results = await searchWeb(query, 4);
    for (const result of results) {
      const resultText = `${result.title} ${result.snippet}`;
      const fromSnippet = extractLicenseDetails(resultText);
      if (fromSnippet.found) {
        return {
          ...fromSnippet,
          found: true,
          licenseSourceUrl: result.url,
          licenseSourceNotes: `License found from search result. Query: "${query}". Snippet: ${result.snippet || result.title}`
        };
      }

      const key = result.url.toLowerCase().replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const html = await fetchHtml(result.url, 9000);
        const pageText = textFromHtml(html);
        const fromPage = extractLicenseDetails(pageText);
        if (fromPage.found) {
          return {
            ...fromPage,
            found: true,
            licenseSourceUrl: result.url,
            licenseSourceNotes: `License found from public page. Query: "${query}". Page title: ${result.title}`
          };
        }
      } catch (_error) {
        // Some directories block page fetches; snippet evidence above is still checked.
      }
    }
  }

  return {
    found: false,
    licenseSourceNotes: `No specific license number found after targeted searches: ${queries.join(" | ")}`
  };
}

async function enrichLicenseForSubcontractor(id) {
  const coll = await collection("subcontractors");
  if (!coll) throw new Error("MongoDB is not configured. Set MONGODB_URI to enable server persistence.");
  const record = await coll.findOne({ _id: new ObjectId(id) });
  if (!record) throw new Error("Subcontractor not found.");
  const result = await findSubcontractorLicense(record);
  const now = new Date().toISOString();
  const update = {
    licenseLastCheckedAt: now,
    licenseSourceNotes: result.licenseSourceNotes || ""
  };
  if (result.found) {
    update.licenseNumber = result.licenseNumber;
    update.licenseClass = result.licenseClass || record.licenseClass || "";
    update.licenseType = result.licenseType || result.licenseClass || record.licenseType || record.licenseClass || "";
    update.licenseSourceUrl = result.licenseSourceUrl || "";
    update.licenseVerified = true;
    update.sourceConfidence = record.sourceConfidence === "low" ? "medium" : (record.sourceConfidence || "medium");
    update.sourceUrls = mergeUrls(record.sourceUrls || [], [result.licenseSourceUrl]);
    update.sourceNotes = cleanString([record.sourceNotes, result.licenseSourceNotes].filter(Boolean).join(" | "));
  }
  await coll.updateOne({ _id: record._id }, { $set: { ...update, updatedAt: now } });
  return { id, companyName: record.companyName, ...result, licenseLastCheckedAt: now };
}

async function upsertSourcedSubcontractor(coll, input) {
  const now = new Date().toISOString();
  const doc = { ...normalize(input), updatedAt: now };
  const existing = await coll.findOne({
    $or: [
      ...(doc.website ? [{ website: doc.website }] : []),
      ...(doc.companyName ? [{ companyName: doc.companyName, serviceCategory: doc.serviceCategory }] : [])
    ]
  });

  if (existing) {
    const merged = {
      ...doc,
      createdAt: existing.createdAt || now,
      sourceUrls: mergeUrls(existing.sourceUrls || [], doc.sourceUrls || []),
      sourceNotes: cleanString([existing.sourceNotes, doc.sourceNotes].filter(Boolean).join(" | ")),
      sourcingMethod: existing.sourcingMethod === "manual" ? "manual" : doc.sourcingMethod
    };
    await coll.updateOne({ _id: existing._id }, { $set: merged });
    return { ...merged, id: existing._id.toString(), updatedExisting: true };
  }

  const result = await coll.insertOne({ ...doc, createdAt: now });
  return { ...doc, id: result.insertedId.toString(), updatedExisting: false };
}

function buildSubcontractorQueries(input) {
  const service = cleanString(input.serviceCategory || "general contractor subcontractor");
  const market = cleanString(input.market || "Los Angeles CA");
  const sources = cleanArray(input.sources).length
    ? cleanArray(input.sources)
    : ["Yelp", "Google", "Angi", "Instagram", "Facebook", "BBB", "CSLB", "company websites"];
  // Owner-reach mindset: bias toward owner-named, reachable, reviewed profiles.
  // Only job boards are excluded now — review/social platforms are where owner-operators live.
  const exclusions = "-jobs -careers -hiring -\"apply now\" -\"top 10\" -\"best 15\"";
  const base = [
    `${service} contractor ${market} owner licensed insured phone ${exclusions}`,
    `${service} subcontractor ${market} owner "family owned" license ${exclusions}`,
    `"${service}" ${market} CSLB license owner ${exclusions}`
  ];
  const sourceQueries = sources.map((source) => {
    if (/yelp/i.test(source)) return `${service} ${market} site:yelp.com/biz`;
    if (/google/i.test(source)) return `${service} contractor ${market} owner reviews phone ${exclusions}`;
    if (/angi|angie/i.test(source)) return `${service} ${market} site:angi.com`;
    if (/instagram|ig/i.test(source)) return `${service} contractor ${market} site:instagram.com`;
    if (/facebook|fb|meta/i.test(source)) return `${service} contractor ${market} site:facebook.com`;
    if (/bbb/i.test(source)) return `${service} ${market} owner site:bbb.org`;
    if (/nextdoor/i.test(source)) return `${service} contractor ${market} site:nextdoor.com`;
    if (/linkedin/i.test(source)) return `site:linkedin.com/company ${service} contractor ${market}`;
    if (/permit|cslb|license/i.test(source)) return `${service} contractor ${market} CSLB license owner phone ${exclusions}`;
    if (/supplier|referral/i.test(source)) return `${service} contractor ${market} owner licensed supplier recommended ${exclusions}`;
    return `${source} ${service} contractor ${market} owner licensed insured ${exclusions}`;
  });
  return [...new Set([...sourceQueries, ...base])].slice(0, Number(input.queryLimit || 10));
}

async function runSubcontractorAgent(input) {
  const coll = await collection("subcontractors");
  if (!coll) throw new Error("MongoDB is not configured. Set MONGODB_URI to enable server persistence.");
  const runId = `sub-agent-${Date.now()}`;
  const serviceCategory = cleanString(input.serviceCategory || "General subcontractor");
  const market = cleanString(input.market || "Los Angeles CA");
  const maxResults = clamp(Number(input.maxResults || 12), 1, 30);
  const queries = buildSubcontractorQueries(input);
  const seen = new Set();
  const saved = [];
  const errors = [];
  const skipped = [];

  for (const query of queries) {
    try {
      const results = await searchWeb(query, Math.ceil(maxResults / queries.length) + 2);
      for (const result of results) {
        const key = result.url.toLowerCase().replace(/\/$/, "");
        if (seen.has(key) || saved.length >= maxResults) continue;
        seen.add(key);
        const enriched = await enrichPublicResult(result);
        const sourceType = sourceTypeForUrl(result.url);
        const validation = validateSubcontractorCandidate(result, enriched, serviceCategory, market);
        if (!validation.ok) {
          skipped.push({
            title: result.title,
            url: result.url,
            reason: validation.reason,
            query
          });
          continue;
        }
        const savedDoc = await upsertSourcedSubcontractor(coll, {
          ...enriched,
          companyName: enriched.companyName || companyFromResult(result),
          serviceCategory,
          serviceArea: market,
          specialties: [serviceCategory],
          reviewSource: enriched.reviewSource || sourceType,
          sourceUrls: mergeUrls(enriched.sourceUrls || [], [result.url, result.searchUrl]),
          sourceNotes: cleanString([
            `Agent run ${runId}. Query: "${query}". Source: ${sourceType}.`,
            validation.method,
            result.snippet ? `Snippet: ${result.snippet}` : "",
            enriched.sourceNotes
          ].filter(Boolean).join(" ")),
          status: "researching",
          sourcingMethod: "agent",
          sourcingRunId: runId,
          agentStatus: "needs_review",
          sourceConfidence: enriched.licenseNumber ? "high" : (enriched.sourceConfidence || "medium")
        });
        saved.push(savedDoc);
      }
    } catch (error) {
      errors.push({ query, error: error.message });
    }
  }

  const runs = await collection("sourcingRuns");
  if (runs) {
    await runs.insertOne({
      runId,
      type: "subcontractor",
      serviceCategory,
      market,
      queries,
      savedCount: saved.length,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 50),
      errors,
      createdAt: new Date().toISOString()
    });
  }

  return { runId, serviceCategory, market, queries, savedCount: saved.length, skippedCount: skipped.length, skipped, saved, errors };
}

app.get("/api/health", async (_req, res) => {
  const hasMongo = Boolean(mongoUri);
  res.json({ ok: true, mongoConfigured: hasMongo, dbName });
});

app.get("/api/subcontractors", async (_req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ fitScore: -1, companyName: 1 }).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/subcontractors", async (req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const now = new Date().toISOString();
  const doc = { ...normalize(req.body), createdAt: now, updatedAt: now };
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.post("/api/subcontractors/bulk", async (req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = Array.isArray(req.body.records) ? req.body.records : [];
  const saved = [];
  for (const row of rows.slice(0, 250)) {
    saved.push(await upsertSourcedSubcontractor(coll, {
      ...row,
      sourcingMethod: cleanString(row.sourcingMethod || "csv"),
      agentStatus: cleanString(row.agentStatus || "needs_review"),
      sourceConfidence: cleanString(row.sourceConfidence || "low")
    }));
  }
  res.status(201).json({ savedCount: saved.length, saved });
});

app.post("/api/subcontractors/agent-search", async (req, res) => {
  try {
    const result = await runSubcontractorAgent(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/subcontractors/:id/license-search", async (req, res) => {
  try {
    const result = await enrichLicenseForSubcontractor(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/subcontractors/:id/activities", async (req, res) => {
  const coll = await collection("subcontractorActivities");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({ subcontractorId: req.params.id }).sort({ occurredAt: -1, createdAt: -1 }).limit(100).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/subcontractors/:id/activities", async (req, res) => {
  const activityColl = await collection("subcontractorActivities");
  const subColl = await collection("subcontractors");
  if (!activityColl || !subColl) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const now = new Date().toISOString();
  const activity = {
    subcontractorId: req.params.id,
    type: cleanString(req.body.type || "note"),
    contactName: cleanString(req.body.contactName),
    outcome: cleanString(req.body.outcome || "logged"),
    subject: cleanString(req.body.subject),
    notes: cleanString(req.body.notes),
    occurredAt: cleanString(req.body.occurredAt || now),
    createdAt: now
  };
  await activityColl.insertOne(activity);
  const update = { updatedAt: now, chaseNotes: cleanString(req.body.notes) };
  if (activity.type === "phone_call" || activity.type === "outbound_email") {
    update.lastContactedAt = activity.occurredAt;
    update.status = activity.outcome === "bid_requested" || activity.outcome === "meeting_scheduled" ? "bid requested" : "called";
    update.chaseState = activity.outcome === "bid_requested" || activity.outcome === "meeting_scheduled" ? "responded" : "contacted";
  }
  if (activity.type === "inbound_reply") {
    update.chaseState = "responded";
    update.status = "qualified";
  }
  if (cleanString(req.body.nextFollowUpAt)) update.nextFollowUpAt = cleanString(req.body.nextFollowUpAt);
  await subColl.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
  res.status(201).json(activity);
});

app.post("/api/subcontractors/:id/chase-task", async (req, res) => {
  const coll = await collection("subcontractors");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const record = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!record) return res.status(404).json({ error: "Subcontractor not found." });
  res.json(buildSubcontractorChaseTask(record, cleanString(req.body.mode || "both")));
});

app.post("/api/subcontractors/license-search-missing", async (req, res) => {
  try {
    const coll = await collection("subcontractors");
    if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
    const limit = clamp(Number(req.body.limit || 10), 1, 25);
    const serviceCategory = cleanString(req.body.serviceCategory);
    const query = {
      $or: [{ licenseNumber: "" }, { licenseNumber: { $exists: false } }]
    };
    if (serviceCategory) query.serviceCategory = serviceCategory;
    const rows = await coll.find(query).sort({ fitScore: -1, companyName: 1 }).limit(limit).toArray();
    const results = [];
    for (const row of rows) {
      results.push(await enrichLicenseForSubcontractor(row._id.toString()));
    }
    res.json({
      checkedCount: results.length,
      foundCount: results.filter((result) => result.found).length,
      results
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.put("/api/subcontractors/:id", async (req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const update = { ...normalize(req.body), updatedAt: new Date().toISOString() };
  await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
  res.json({ ...update, id: req.params.id });
});

app.delete("/api/subcontractors/:id", async (req, res) => {
  const coll = await collection();
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await coll.deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).end();
});

function normalizeLead(input) {
  const value = Number(input.estimatedValue || 0);
  const probability = Number(input.probability || 0);
  return {
    customerName: cleanString(input.customerName),
    phone: cleanString(input.phone),
    email: cleanString(input.email).toLowerCase(),
    city: cleanString(input.city),
    projectType: cleanString(input.projectType),
    source: cleanString(input.source),
    sourceUrl: cleanString(input.sourceUrl),
    status: cleanString(input.status || "new"),
    priority: cleanString(input.priority || "medium"),
    estimatedValue: value,
    probability,
    expectedValue: Math.round(value * (probability / 100)),
    nextAction: cleanString(input.nextAction),
    nextActionDate: cleanString(input.nextActionDate),
    summary: cleanString(input.summary),
    notes: cleanString(input.notes),
    sourcingMethod: cleanString(input.sourcingMethod || "manual"),
    sourcingRunId: cleanString(input.sourcingRunId),
    agentStatus: cleanString(input.agentStatus || "needs_review"),
    sourceConfidence: cleanString(input.sourceConfidence || "medium"),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function upsertSourcedLead(coll, input) {
  const doc = normalizeLead(input);
  const existing = await coll.findOne({
    $or: [
      ...(doc.sourceUrl ? [{ sourceUrl: doc.sourceUrl }] : []),
      ...(doc.customerName ? [{ customerName: doc.customerName, projectType: doc.projectType, source: doc.source }] : [])
    ]
  });

  if (existing) {
    const merged = {
      ...doc,
      createdAt: existing.createdAt || doc.createdAt,
      notes: cleanString([existing.notes, doc.notes].filter(Boolean).join(" | ")),
      sourcingMethod: existing.sourcingMethod === "manual" ? "manual" : doc.sourcingMethod
    };
    await coll.updateOne({ _id: existing._id }, { $set: merged });
    return { ...merged, id: existing._id.toString(), updatedExisting: true };
  }

  const result = await coll.insertOne(doc);
  return { ...doc, id: result.insertedId.toString(), updatedExisting: false };
}

function buildLeadQueries(input) {
  const projectType = cleanString(input.projectType || "remodel");
  const market = cleanString(input.market || "Los Angeles CA");
  const intent = cleanString(input.intent || "estimate request");
  return [
    `site:craigslist.org ${projectType} ${market} "${intent}"`,
    `site:nextdoor.com ${projectType} ${market} recommendation contractor`,
    `site:facebook.com/groups ${projectType} ${market} contractor recommendation`,
    `${projectType} ${market} homeowner looking for contractor`,
    `${projectType} ${market} property manager contractor needed`,
    `${projectType} ${market} request estimate contractor`
  ].slice(0, Number(input.queryLimit || 6));
}

function estimateLeadValue(projectType) {
  const lower = cleanString(projectType).toLowerCase();
  if (lower.includes("adu") || lower.includes("addition")) return 160000;
  if (lower.includes("tenant")) return 85000;
  if (lower.includes("full") || lower.includes("renovation")) return 120000;
  if (lower.includes("kitchen")) return 55000;
  if (lower.includes("bath")) return 30000;
  if (lower.includes("roof") || lower.includes("concrete")) return 18000;
  return 25000;
}

async function runCustomerLeadAgent(input) {
  const coll = await collection("customerLeads");
  if (!coll) throw new Error("MongoDB is not configured. Set MONGODB_URI to enable server persistence.");
  const runId = `lead-agent-${Date.now()}`;
  const projectType = cleanString(input.projectType || "Remodel");
  const market = cleanString(input.market || "Los Angeles CA");
  const maxResults = clamp(Number(input.maxResults || 10), 1, 25);
  const queries = buildLeadQueries(input);
  const saved = [];
  const errors = [];
  const seen = new Set();

  for (const query of queries) {
    try {
      const results = await searchWeb(query, Math.ceil(maxResults / queries.length) + 2);
      for (const result of results) {
        const key = result.url.toLowerCase().replace(/\/$/, "");
        if (seen.has(key) || saved.length >= maxResults) continue;
        seen.add(key);
        const value = estimateLeadValue(projectType);
        const sourceType = sourceTypeForUrl(result.url);
        saved.push(await upsertSourcedLead(coll, {
          customerName: companyFromResult(result) || "Research candidate",
          city: market,
          projectType,
          source: sourceType,
          sourceUrl: result.url,
          status: "new",
          priority: sourceType === "Craigslist" ? "high" : "medium",
          estimatedValue: value,
          probability: 15,
          nextAction: "Review source, verify fit, then contact only if the post/source exposes a legitimate outreach path.",
          summary: result.snippet || result.title,
          notes: `Agent run ${runId}. Query: "${query}". Source-backed candidate only; verify before outreach.`,
          sourcingMethod: "agent",
          sourcingRunId: runId,
          agentStatus: "needs_review",
          sourceConfidence: result.snippet ? "medium" : "low"
        }));
      }
    } catch (error) {
      errors.push({ query, error: error.message });
    }
  }

  const runs = await collection("sourcingRuns");
  if (runs) {
    await runs.insertOne({
      runId,
      type: "customer-lead",
      projectType,
      market,
      queries,
      savedCount: saved.length,
      errors,
      createdAt: new Date().toISOString()
    });
  }

  return { runId, projectType, market, queries, savedCount: saved.length, saved, errors };
}

function normalizeTraffic(input) {
  const visits = Number(input.visits || 0);
  const leads = Number(input.leads || 0);
  const calls = Number(input.calls || 0);
  const impressions = Number(input.impressions || 0);
  const clicks = Number(input.clicks || 0);
  const spend = Number(input.spend || 0);
  const keyEvents = Number(input.keyEvents || 0);
  return {
    date: cleanString(input.date || new Date().toISOString().slice(0, 10)),
    channel: cleanString(input.channel || "Website"),
    platform: cleanString(input.platform || input.channel || "Website"),
    campaign: cleanString(input.campaign),
    objective: cleanString(input.objective),
    landingPage: cleanString(input.landingPage),
    utmSource: cleanString(input.utmSource),
    utmMedium: cleanString(input.utmMedium),
    utmCampaign: cleanString(input.utmCampaign),
    impressions,
    clicks,
    visits,
    leads,
    calls,
    spend,
    keyEvents,
    source: cleanString(input.source),
    notes: cleanString(input.notes),
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
    cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : 0,
    conversionRate: visits > 0 ? Number(((leads / visits) * 100).toFixed(1)) : 0,
    callRate: visits > 0 ? Number(((calls / visits) * 100).toFixed(1)) : 0,
    updatedAt: new Date().toISOString()
  };
}

function normalizeBidLineItem(input) {
  return {
    id: cleanString(input.id || cryptoId()),
    trade: cleanString(input.trade),
    description: cleanString(input.description),
    quantity: cleanString(input.quantity),
    unit: cleanString(input.unit),
    allowance: cleanString(input.allowance),
    lowCost: Number(input.lowCost || 0),
    highCost: Number(input.highCost || 0),
    selectedSubcontractorId: cleanString(input.selectedSubcontractorId),
    validationStatus: cleanString(input.validationStatus || "unvalidated"),
    notes: cleanString(input.notes)
  };
}

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

function cryptoId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBidProject(input) {
  const lineItems = Array.isArray(input.lineItems) ? input.lineItems.map(normalizeBidLineItem) : [];
  const subQuotes = Array.isArray(input.subQuotes) ? input.subQuotes.map(normalizeSubQuote) : [];
  const internalEstimatedCost = Number(input.internalEstimatedCost || 0);
  const finalProposalAmount = Number(input.finalProposalAmount || 0);
  const actualCost = Number(input.actualCost || 0);
  const budgetLow = Number(input.budgetLow || 0);
  const budgetHigh = Number(input.budgetHigh || 0);
  const contingencyPercent = Number(input.contingencyPercent || 12);
  const markupPercent = Number(input.markupPercent || 25);
  return {
    leadId: cleanString(input.leadId),
    customerName: cleanString(input.customerName),
    projectType: cleanString(input.projectType),
    city: cleanString(input.city),
    neighborhood: cleanString(input.neighborhood),
    propertyType: cleanString(input.propertyType),
    clientBudget: cleanString(input.clientBudget),
    status: cleanString(input.status || "intake"),
    outcome: cleanString(input.outcome || "open"),
    sourceUrl: cleanString(input.sourceUrl),
    walkthroughDate: cleanString(input.walkthroughDate),
    designerStatus: cleanString(input.designerStatus || "not_needed_yet"),
    designerName: cleanString(input.designerName),
    designPackageFee: Number(input.designPackageFee || 0),
    scopeDraft: cleanString(input.scopeDraft),
    photosNotes: cleanString(input.photosNotes),
    mustHaves: cleanString(input.mustHaves),
    niceToHaves: cleanString(input.niceToHaves),
    unknowns: cleanString(input.unknowns),
    budgetLow,
    budgetHigh,
    budgetRangeNotes: cleanString(input.budgetRangeNotes),
    internalEstimatedCost,
    contingencyPercent,
    markupPercent,
    targetGrossMarginPercent: Number(input.targetGrossMarginPercent || 30),
    finalProposalAmount,
    actualCost,
    lostReason: cleanString(input.lostReason),
    lineItems,
    subQuotes,
    fixedBidReady: Boolean(input.fixedBidReady),
    fixedBidReadinessNotes: cleanString(input.fixedBidReadinessNotes),
    nextAction: cleanString(input.nextAction),
    nextActionDate: cleanString(input.nextActionDate),
    updatedAt: new Date().toISOString()
  };
}

function buildScopeDraft(input) {
  const projectType = cleanString(input.projectType || "remodel project");
  const mustHaves = cleanString(input.mustHaves);
  const notes = cleanString(input.photosNotes || input.scopeDraft);
  const unknowns = cleanString(input.unknowns);
  return [
    `Project: ${projectType}`,
    input.city || input.neighborhood ? `Location: ${[input.neighborhood, input.city].filter(Boolean).join(", ")}` : "",
    mustHaves ? `Client must-haves: ${mustHaves}` : "",
    notes ? `Walkthrough/photo notes: ${notes}` : "",
    unknowns ? `Unknowns to validate before fixed bid: ${unknowns}` : "",
    "",
    "Trade package draft:",
    "- Demo/haul-off: confirm existing conditions, access, protection, disposal, and patch-back.",
    "- Carpentry/hardscape/interior finishes: quantify visible work and define material allowances.",
    "- Electrical/plumbing/irrigation/drainage: validate permit/code risk and concealed conditions before fixed price.",
    "- Paint/touch-up/cleanup: include closeout expectations and exclusions.",
    "",
    "Pricing rule: issue a planning range first. Do not issue a fixed bid until major trade packages have sub validation, allowances, exclusions, and change-order rules."
  ].filter((line) => line !== "").join("\n");
}

function buildQuoteRequest(project, trade = "") {
  const scope = cleanString(project.scopeDraft) || buildScopeDraft(project);
  return [
    `Bid validation request - ${trade || project.projectType || "project"}`,
    "",
    `Project: ${project.projectType || "Unknown"}`,
    `Location: ${[project.neighborhood, project.city].filter(Boolean).join(", ") || "Los Angeles area"}`,
    `Client planning range shown: ${project.budgetLow || "?"} - ${project.budgetHigh || "?"}`,
    "",
    "Please reply with a budget range or fixed quote, plus exclusions and what else you need to tighten it within 24-48 hours.",
    "",
    scope,
    "",
    "Required reply format:",
    "1. Budget low / high or fixed quote",
    "2. Included scope",
    "3. Exclusions",
    "4. Needed photos, measurements, drawings, site visit, or selections",
    "5. Earliest start / expected duration",
    "6. Confidence: low, medium, or high"
  ].join("\n");
}

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

app.get("/api/customer-leads", async (_req, res) => {
  const coll = await collection("customerLeads");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ updatedAt: -1, customerName: 1 }).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/customer-leads", async (req, res) => {
  const coll = await collection("customerLeads");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const doc = normalizeLead(req.body);
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.post("/api/customer-leads/agent-search", async (req, res) => {
  try {
    const result = await runCustomerLeadAgent(req.body || {});
    res.status(201).json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.put("/api/customer-leads/:id", async (req, res) => {
  const coll = await collection("customerLeads");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const update = normalizeLead(req.body);
  await coll.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
  res.json({ ...update, id: req.params.id });
});

app.delete("/api/customer-leads/:id", async (req, res) => {
  const coll = await collection("customerLeads");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await coll.deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).end();
});

app.get("/api/traffic", async (_req, res) => {
  const coll = await collection("websiteTraffic");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ date: -1, channel: 1 }).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/traffic", async (req, res) => {
  const coll = await collection("websiteTraffic");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const doc = normalizeTraffic(req.body);
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.get("/api/bid-projects", async (_req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const rows = await coll.find({}).sort({ updatedAt: -1, customerName: 1 }).toArray();
  res.json(rows.map((row) => ({ ...row, id: row._id.toString(), _id: undefined })));
});

app.post("/api/bid-projects", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const now = new Date().toISOString();
  const doc = { ...normalizeBidProject(req.body), createdAt: now };
  const readiness = fixedBidReadiness(doc);
  doc.fixedBidReady = readiness.ready;
  doc.fixedBidReadinessNotes = readiness.notes;
  const result = await coll.insertOne(doc);
  res.status(201).json({ ...doc, id: result.insertedId.toString() });
});

app.put("/api/bid-projects/:id", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const existing = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!existing) return res.status(404).json({ error: "Bid project not found." });
  const update = { ...normalizeBidProject(req.body), createdAt: existing.createdAt || new Date().toISOString() };
  const readiness = fixedBidReadiness(update);
  update.fixedBidReady = readiness.ready;
  update.fixedBidReadinessNotes = readiness.notes;
  await coll.updateOne({ _id: existing._id }, { $set: update });
  res.json({ ...update, id: req.params.id });
});

app.delete("/api/bid-projects/:id", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  await coll.deleteOne({ _id: new ObjectId(req.params.id) });
  res.status(204).end();
});

app.post("/api/bid-projects/:id/scope-draft", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const record = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!record) return res.status(404).json({ error: "Bid project not found." });
  const scopeDraft = buildScopeDraft({ ...record, ...req.body });
  const updated = { ...record, scopeDraft, updatedAt: new Date().toISOString() };
  const readiness = fixedBidReadiness(updated);
  await coll.updateOne({ _id: record._id }, { $set: { scopeDraft, fixedBidReady: readiness.ready, fixedBidReadinessNotes: readiness.notes, updatedAt: updated.updatedAt } });
  res.json({ scopeDraft, fixedBidReady: readiness.ready, fixedBidReadinessNotes: readiness.notes });
});

app.post("/api/bid-projects/:id/quote-request", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const record = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!record) return res.status(404).json({ error: "Bid project not found." });
  res.json({ quoteRequest: buildQuoteRequest(record, cleanString(req.body.trade)) });
});

app.post("/api/bid-projects/:id/sub-quotes", async (req, res) => {
  const coll = await collection("bidProjects");
  if (!coll) return res.status(503).json({ error: "MongoDB is not configured. Set MONGODB_URI to enable server persistence." });
  const record = await coll.findOne({ _id: new ObjectId(req.params.id) });
  if (!record) return res.status(404).json({ error: "Bid project not found." });
  const subQuotes = [...(Array.isArray(record.subQuotes) ? record.subQuotes : []), normalizeSubQuote(req.body)];
  const updated = { ...record, subQuotes };
  const readiness = fixedBidReadiness(updated);
  await coll.updateOne({ _id: record._id }, { $set: { subQuotes, fixedBidReady: readiness.ready, fixedBidReadinessNotes: readiness.notes, updatedAt: new Date().toISOString() } });
  res.status(201).json({ subQuotes, fixedBidReady: readiness.ready, fixedBidReadinessNotes: readiness.notes });
});

app.post("/api/subcontractors/research-url", async (req, res) => {
  const url = cleanString(req.body.url);
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Provide an http or https URL." });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "JoonSubcontractorFinder/1.0 (+manual research CRM)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const html = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: `Source returned HTTP ${response.status}.` });
    res.json(parseResearchPage(url, html));
  } catch (error) {
    res.status(502).json({ error: `Could not import that public page: ${error.message}` });
  } finally {
    clearTimeout(timeout);
  }
});

publicApp.listen(publicPort, () => {
  console.log(`Joon public website running at http://localhost:${publicPort}`);
});

crmApp.listen(crmPort, () => {
  console.log(`Joon subcontractor CRM running at http://localhost:${crmPort}`);
  console.log(mongoUri ? `Mongo persistence enabled: ${dbName}.subcontractors` : "Mongo persistence disabled. Set MONGODB_URI to enable it.");
});
