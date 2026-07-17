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

## RENDER BACKEND (Design view)

The Design view's **Generate here** button posts the room photo + composed prompt to `POST /api/knowledge/redesign`. Gemini is the ONLY render backend (billing enabled 2026-07-16; the Decor8 integration was removed the same day). The response reports `backend: "gemini" | "bridge"`.

- **Model ladder (quality-first):** `gemini-3.1-flash-image` (default, ~8s) → `gemini-2.5-flash-image` → `gemini-3.1-flash-lite-image` as error fallbacks. `?quality=max` prepends `gemini-3-pro-image-preview` (~15s, highest fidelity) — the UI's **Quality Fast/Max** toggle.
- **Variations:** `?n=1-4` renders in PARALLEL server-side (one photo upload, n simultaneous Gemini edits), so 4 variations cost one render's wall-clock. Cost ~$0.04/image.
- **Style library:** `GET /api/knowledge/styles` serves `knowledge/design-styles.json` — the shared style knowledge base. The Design view builds its chips from it; `/design-brief` injects the matched style's card (signature elements, materials, lighting, mood, avoid-list) into the prompt composer; the same content lives in the Q&A corpus as `source: "design-styles"` chunks.
- **Bridge fallback:** if every Gemini attempt errors, the response returns `backend:"bridge"` + the composed prompt and the UI offers **Open in Gemini (free)** so the flow never dead-ends.
