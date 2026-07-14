// authgate.js — pure, dependency-free access-control decision logic for the
// CRM gate (Feature 3). Kept separate from server.js so the decision function
// can be unit tested in isolation (no Express, no Mongo, no listening port) -
// see tmp-tests/authgate.decide.test.js (run with `node <path>`).
//
// Design (Ori's spec, 2026-07-13):
//  - Loopback (127.0.0.1/::1) and Tailscale CGNAT (100.64.0.0/10) callers
//    bypass auth entirely - PM2 jobs, vetsweep self-calls, local agents, and
//    Ori's own phone over Tailscale all keep working with zero friction.
//  - A short whitelist of public paths (marketing site, public token pages,
//    public lead-capture endpoints) stays open to everyone else.
//  - Everything else needs a valid signed "joon_auth" cookie.
const crypto = require("crypto");

const LOOPBACK_ADDRS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function stripV4Mapped(ip) {
  return String(ip || "").replace(/^::ffff:/i, "");
}

function ipToLong(ip) {
  const parts = String(ip).split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isLoopback(remoteAddress) {
  return LOOPBACK_ADDRS.has(String(remoteAddress || ""));
}

// Tailscale's CGNAT range - Ori's phone reaches :4373 over Tailscale without a
// public domain in front of it, so treat that range like a trusted LAN.
const TAILNET_BASE = ipToLong("100.64.0.0");
const TAILNET_MASK = (0xffffffff << (32 - 10)) >>> 0; // /10

function isTailnet(remoteAddress) {
  const long = ipToLong(stripV4Mapped(remoteAddress));
  if (long === null) return false;
  return (long & TAILNET_MASK) === (TAILNET_BASE & TAILNET_MASK);
}

// Any-method exact paths that never need a login. The two /api/estimate-*
// entries are hyphen-suffixed endpoint names (not a "/api/estimate/..."
// sub-path), so they're listed exactly rather than as a prefix - a plain
// prefix would also have to match by bare string, which risks over-matching
// future endpoints like a hypothetical "/api/estimated-costs".
const PUBLIC_EXACT_ANY_METHOD = new Set([
  "/", "/index.html", "/estimate.html", "/sw.js", "/login",
  "/api/estimate-config", "/api/estimate-lead"
]);

// Any-method path prefixes - the public marketing/lead-gen surface. Most of
// these are already handled by publicApp before the request ever reaches the
// crmApp gate (see server.js's route order), but they're listed here too so
// the gate is correct in isolation and stays correct if that order ever changes.
const PUBLIC_PREFIXES = [
  "/assets", // static site assets, incl. /assets/design.html + /assets/vendor/*
  "/design", // reserved for future public design/3D lead-magnet routes
  "/gallery", // token-gated public photo gallery (its own auth, not ours)
  "/rfq", // public RFQ form + its public POST
  "/co" // public change-order approval
];

// Exact (method, path) pairs - narrower than a prefix because the rest of the
// resource needs to stay protected. POST creates a lead from the public
// design.html capture form; GET/PUT/DELETE on the same collection are CRM-only.
const PUBLIC_METHOD_EXACT = [
  { method: "POST", path: "/api/customer-leads" }
];

function cleanPath(urlPath) {
  const clean = String(urlPath || "").split("?")[0];
  if (clean.length > 1 && clean.endsWith("/")) return clean.slice(0, -1);
  return clean || "/";
}

function isPublicPath(method, urlPath) {
  const clean = cleanPath(urlPath);
  const upperMethod = String(method || "GET").toUpperCase();
  if (PUBLIC_EXACT_ANY_METHOD.has(clean)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(prefix + "/"))) return true;
  if (PUBLIC_METHOD_EXACT.some((rule) => rule.method === upperMethod && rule.path === clean)) return true;
  return false;
}

// ── Signed cookie: HMAC(secret, expiry) + expiry, no session store needed ──
function signCookie(secret, expiryMs) {
  const mac = crypto.createHmac("sha256", secret).update(String(expiryMs)).digest("hex");
  return `${mac}.${expiryMs}`;
}

function verifyCookie(secret, value) {
  if (!secret || !value) return false;
  const idx = String(value).lastIndexOf(".");
  if (idx === -1) return false;
  const mac = value.slice(0, idx);
  const expiryStr = value.slice(idx + 1);
  if (!/^\d+$/.test(expiryStr)) return false;
  const expected = crypto.createHmac("sha256", secret).update(expiryStr).digest("hex");
  let macBuf;
  let expectedBuf;
  try {
    macBuf = Buffer.from(mac, "hex");
    expectedBuf = Buffer.from(expected, "hex");
  } catch (_error) {
    return false;
  }
  if (macBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(macBuf, expectedBuf)) return false;
  return Date.now() < Number(expiryStr);
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) { try { out[key] = decodeURIComponent(val); } catch (_error) { out[key] = val; } }
  });
  return out;
}

function serializeAuthCookie(value, maxAgeMs) {
  return [
    `joon_auth=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ].join("; ");
}

function clearAuthCookie() {
  return "joon_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

// The core, pure decision. Never touches the network/DB - just the request
// shape - so it can be exercised head-on by a unit test with zero server boot.
// Returns { allow: bool, reason: string } - reason is for logs/tests only.
function decide({ method, path, remoteAddress, cookieHeader, secret }) {
  if (isLoopback(remoteAddress)) return { allow: true, reason: "loopback" };
  if (isTailnet(remoteAddress)) return { allow: true, reason: "tailnet" };
  if (isPublicPath(method, path)) return { allow: true, reason: "public-path" };
  const cookies = parseCookies(cookieHeader);
  if (verifyCookie(secret, cookies.joon_auth)) return { allow: true, reason: "valid-cookie" };
  return { allow: false, reason: "unauthorized" };
}

module.exports = {
  isLoopback, isTailnet, isPublicPath, decide,
  signCookie, verifyCookie, parseCookies, serializeAuthCookie, clearAuthCookie,
  PUBLIC_EXACT_ANY_METHOD, PUBLIC_PREFIXES, PUBLIC_METHOD_EXACT
};
