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

## RENDER BACKENDS (Design view)

The Design view's **Generate here** button posts the room photo + composed prompt to `POST /api/knowledge/redesign`. That endpoint tries render backends in a fixed order and reports which one served the image via a `backend` field on the JSON response (`"decor8"` | `"gemini"` | `"bridge"`). Drop either key into `contractor/.env` and `pm2 restart joon-contractor --update-env` to turn on in-app generation:

| Order | `.env` key | Backend | Cost / image | Notes |
|---|---|---|---|---|
| (a) | `DECOR8_API_KEY` | Decor8.ai `POST /generate_designs_for_room` | **~$0.20** | Purpose-built interior redesign API. The composed prompt is passed as `prompt` (overrides room_type/design_style); `?n=` requests 1–4 variations in one call. Hosted result URLs are downloaded into `/uploads/knowledge-gen/` for persistence. |
| (b) | `GEMINI_API_KEY` | Google Gemini image edit ("Nano Banana") | **~$0.04** (batch ~$0.02) | Free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey); note the free tier currently allows **0** image calls, so this only renders once billing is enabled. General image model — no dedicated structure-preservation conditioning. |
| (c) | *(neither set)* | Free bridge to `gemini.google.com` | $0 | No in-app image. Returns `backend:"bridge"` + the composed prompt; the UI's **Open in Gemini (free)** button copies the prompt (with the variations directive appended when Variations > 1) so Ori renders it free under his Google AI Pro plan. |

If `DECOR8_API_KEY` is set but the call fails, the endpoint falls through to Gemini (if configured) and then the bridge, so the UI never dead-ends. The **Variations 1/2/4** selector loops N sequential `/redesign` calls in the in-app path and collects them into a variation grid; on the bridge path it appends `Generate N distinct variations…` to the copied prompt instead.
