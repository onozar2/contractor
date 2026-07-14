## AUTH

The CRM (everything under `crmApp` — `/app.html`, all `/api/*`, `bid_lab.html`, `estimator.html`, etc.) sits behind a login gate (`authgate.js` + the middleware in `server.js`). The public marketing site, the public lead-capture widget (`/assets/design.html` → `POST /api/customer-leads`), the token-gated galleries/RFQ/change-order pages, and `/estimate.html` stay open with no login.

**Who skips the login entirely:**
- Requests from `localhost`/`127.0.0.1`/`::1` (PM2 jobs, vetsweep, local agents, Ori's own browser on this machine).
- Requests from a Tailscale address (`100.64.0.0/10`) — Ori's phone reaches `:4373` over Tailscale without a public domain in front of it.

Everyone else needs a signed `joon_auth` cookie, issued at `POST /login` after the correct password. The cookie is a hand-rolled HMAC(`SESSION_SECRET`, expiry) + expiry — no session store, no extra dependency. It's valid for 30 days.

**To change the password:** edit `CRM_PASSWORD` in `.env`, then `pm2 restart joon-contractor --update-env`. Editing `SESSION_SECRET` invalidates every existing login cookie (forces everyone to log in again) — only change it if you suspect the secret leaked.

**Files:**
- `authgate.js` — pure decision logic (`decide()`), cookie sign/verify, the public-path whitelist. No Express/Mongo/network dependency, so it's unit-testable on its own.
- `authgate.test.js` — the unit tests for that decision logic (`node authgate.test.js`). Covers loopback/tailnet bypass, every public-path rule, protected-path rejection, valid/expired/tampered/wrong-secret cookies, and the method-specific `POST /api/customer-leads` public exception.
- `server.js` — mounts the gate middleware on `crmApp` right after its JSON body parser, plus the `GET/POST /login` and `POST /logout` routes.

**Extending the public whitelist:** add to `PUBLIC_EXACT_ANY_METHOD`, `PUBLIC_PREFIXES`, or `PUBLIC_METHOD_EXACT` in `authgate.js` (the last one is for routes where only one HTTP method on a path should be public — e.g. `POST /api/customer-leads` is public but `GET` on the same path stays CRM-only).
