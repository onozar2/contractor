// authgate.test.js — standalone unit test for the CRM auth-gate decision logic
// (Feature 3). No Express, no Mongo, no listening port - runs the pure
// decide()/signCookie()/verifyCookie() functions directly against the request
// shapes the real middleware would see. Run with: node authgate.test.js
const assert = require("assert");
const authgate = require("./authgate");

const SECRET = "test-secret-do-not-use-in-prod";
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message}`);
    process.exitCode = 1;
  }
}

// ── Loopback bypass ──
check("loopback IPv4 bypasses on a protected path with no cookie", () => {
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "127.0.0.1", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, true);
  assert.strictEqual(d.reason, "loopback");
});
check("loopback IPv6 (::1) bypasses", () => {
  const d = authgate.decide({ method: "GET", path: "/api/dashboard", remoteAddress: "::1", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, true);
});
check("IPv4-mapped IPv6 loopback (::ffff:127.0.0.1) bypasses", () => {
  const d = authgate.decide({ method: "GET", path: "/api/dashboard", remoteAddress: "::ffff:127.0.0.1", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, true);
});

// ── Tailnet bypass ──
check("Tailscale CGNAT address (100.64.0.0/10) bypasses", () => {
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "100.87.14.2", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, true);
  assert.strictEqual(d.reason, "tailnet");
});
check("address just outside the tailnet range (100.128.0.1) does NOT bypass", () => {
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "100.128.0.1", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, false);
});
check("a regular public IP does NOT bypass", () => {
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, false);
});

// ── Public paths open to everyone ──
for (const p of ["/", "/index.html", "/estimate.html", "/sw.js", "/login"]) {
  check(`public exact path ${p} is open with no cookie`, () => {
    const d = authgate.decide({ method: "GET", path: p, remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
    assert.strictEqual(d.allow, true);
    assert.strictEqual(d.reason, "public-path");
  });
}
for (const p of ["/assets/design.html", "/assets/vendor/three.js", "/design/anything", "/gallery/abc123", "/rfq/xyz", "/co/abc", "/api/estimate-config", "/api/estimate-lead"]) {
  check(`public prefix covers ${p}`, () => {
    const d = authgate.decide({ method: "GET", path: p, remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
    assert.strictEqual(d.allow, true);
  });
}

// ── Protected path, no cookie -> reject ──
check("protected path with no cookie is rejected", () => {
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, false);
  assert.strictEqual(d.reason, "unauthorized");
});
check("protected API path with no cookie is rejected", () => {
  const d = authgate.decide({ method: "GET", path: "/api/dashboard", remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, false);
});

// ── Valid cookie -> pass ──
check("a freshly signed, unexpired cookie is accepted", () => {
  const expiry = Date.now() + 30 * 24 * 3600 * 1000;
  const value = authgate.signCookie(SECRET, expiry);
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "203.0.113.9", cookieHeader: `joon_auth=${encodeURIComponent(value)}`, secret: SECRET });
  assert.strictEqual(d.allow, true);
  assert.strictEqual(d.reason, "valid-cookie");
});
check("a valid cookie works alongside other unrelated cookies in the header", () => {
  const expiry = Date.now() + 1000000;
  const value = authgate.signCookie(SECRET, expiry);
  const d = authgate.decide({ method: "GET", path: "/api/dashboard", remoteAddress: "203.0.113.9", cookieHeader: `other=1; joon_auth=${encodeURIComponent(value)}; another=2`, secret: SECRET });
  assert.strictEqual(d.allow, true);
});

// ── Expired / tampered cookie -> reject ──
check("an expired cookie is rejected", () => {
  const expiry = Date.now() - 1000;
  const value = authgate.signCookie(SECRET, expiry);
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "203.0.113.9", cookieHeader: `joon_auth=${encodeURIComponent(value)}`, secret: SECRET });
  assert.strictEqual(d.allow, false);
});
check("a tampered signature is rejected", () => {
  const expiry = Date.now() + 1000000;
  const value = authgate.signCookie(SECRET, expiry);
  const tampered = value.replace(/.$/, value.slice(-1) === "0" ? "1" : "0");
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "203.0.113.9", cookieHeader: `joon_auth=${encodeURIComponent(tampered)}`, secret: SECRET });
  assert.strictEqual(d.allow, false);
});
check("a cookie signed with the WRONG secret is rejected", () => {
  const expiry = Date.now() + 1000000;
  const value = authgate.signCookie("some-other-secret", expiry);
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "203.0.113.9", cookieHeader: `joon_auth=${encodeURIComponent(value)}`, secret: SECRET });
  assert.strictEqual(d.allow, false);
});
check("a malformed cookie value (no separator) is rejected, not thrown", () => {
  const d = authgate.decide({ method: "GET", path: "/app.html", remoteAddress: "203.0.113.9", cookieHeader: "joon_auth=garbage", secret: SECRET });
  assert.strictEqual(d.allow, false);
});

// ── Coordinator requirement: POST /api/customer-leads public, GET protected ──
check("unauthenticated POST /api/customer-leads is allowed (public lead capture)", () => {
  const d = authgate.decide({ method: "POST", path: "/api/customer-leads", remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, true);
  assert.strictEqual(d.reason, "public-path");
});
check("unauthenticated GET /api/customer-leads is rejected (CRM read stays protected)", () => {
  const d = authgate.decide({ method: "GET", path: "/api/customer-leads", remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, false);
});
check("unauthenticated PUT /api/customer-leads/:id is rejected", () => {
  const d = authgate.decide({ method: "PUT", path: "/api/customer-leads/abc123", remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, false);
});
check("unauthenticated DELETE /api/customer-leads/:id is rejected", () => {
  const d = authgate.decide({ method: "DELETE", path: "/api/customer-leads/abc123", remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, false);
});
check("unauthenticated POST /api/customer-leads/agent-search is rejected (not the public exact path)", () => {
  const d = authgate.decide({ method: "POST", path: "/api/customer-leads/agent-search", remoteAddress: "203.0.113.9", cookieHeader: "", secret: SECRET });
  assert.strictEqual(d.allow, false);
});
check("a cookie DOES let GET /api/customer-leads through", () => {
  const expiry = Date.now() + 1000000;
  const value = authgate.signCookie(SECRET, expiry);
  const d = authgate.decide({ method: "GET", path: "/api/customer-leads", remoteAddress: "203.0.113.9", cookieHeader: `joon_auth=${encodeURIComponent(value)}`, secret: SECRET });
  assert.strictEqual(d.allow, true);
});

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ", all green"}`);
