# Contact + photo ingestion (iPhone contacts, WhatsApp, Google)

Two goals: (a) get **your own subs off your phone** into the app, marked as YOUR
personal contacts (trusted) rather than online-sourced, and (b) pull jobsite
**photos** out of WhatsApp. All contacts land in one review CSV first
(`knowledge/whatsapp-contacts-extracted.csv`) — **nothing is auto-added to the
subs database.** You curate, then promote (see "Promote to trusted subs" below).

Provenance is preserved: every row carries a `source` column
(`iphone` | `whatsapp` | `google`) so contacts you hand over are always
distinguishable from anything the sourcing agent found online.

## 0. iPhone contacts → app (the direct path, no Google needed)

This is the fastest way to give me the subs in your phone.

**Option A — a few subs (share as vCard):** Open the **Contacts** app → tap a
contact → scroll down → **Share Contact** → **Save to Files** (or AirDrop to the
PC). To send several at once: Contacts → **Lists** (or a group) → share, or select
multiple and share. You get a `.vcf` file.

**Option B — your whole address book (iCloud):** On a computer go to
**icloud.com → Contacts** → click the gear (bottom-left) → **Select All** →
gear → **Export vCard**. You get one `.vcf` with everyone.

Then, from the `contractor` folder:

```
node scripts/import-whatsapp.mjs "C:\Users\orino\Downloads\Contacts.vcf"
```

It parses the vCard (picks the mobile/cell number, keeps email + company), writes
each person into the review CSV with `source=iphone`, and prints how many it added.
Works with iOS vCard 2.1/3.0/4.0 and iCloud exports.

## Getting photos out of WhatsApp

WhatsApp has no "sync to Drive" button and no contact export. Three practical paths
to get photos and contacts out of it and into this app — use #1 day to day.

## 1. Per-chat export (recommended — no PC WhatsApp needed)

On your iPhone: open the chat → tap the contact/group name → **Export Chat** →
**Attach Media**. This produces a `.zip` (chat `.txt` + every photo in that chat).
Save it to Files, upload to Drive, or AirDrop it to the PC — any way it lands in a
folder works. Then run the importer (see below) against that `.zip`.

## 2. WhatsApp Desktop on Windows (cherry-picking)

Install WhatsApp Desktop, log in via QR code (scan with your phone), open a chat,
and save individual photos to a folder yourself (right-click → Save As, or drag out
of the app). Good for pulling a handful of photos without exporting a whole chat
history. Point the importer at that folder instead of a `.zip` — it accepts both.

## 3. Contacts (no direct WhatsApp export)

WhatsApp contacts are just your phone's address book. To get a clean contact list:
`contacts.google.com` → **Export** → CSV (Google CSV format). Feed that CSV to the
importer with `--contacts-csv` and it normalizes it into the same review file.
Phone numbers also show up naturally inside exported chat `.txt` files whenever the
sender isn't a saved contact (WhatsApp shows their raw number instead of a name).

## Running the importer

```
node scripts/import-whatsapp.mjs <export.zip-or-folder-or-.vcf-or-.csv> [--project <id>] [--vcf <iphone.vcf>] [--contacts-csv <google.csv>]
```

A bare `.vcf` (iPhone/iCloud) or `.csv` (Google Contacts) as the input is auto-detected and
goes straight into the review CSV — no other flags needed.

Examples:

```
node scripts/import-whatsapp.mjs "C:\Users\orino\Downloads\Contacts.vcf"                # iPhone/iCloud contacts
node scripts/import-whatsapp.mjs "C:\Users\orino\Downloads\google-contacts.csv"          # Google contacts
node scripts/import-whatsapp.mjs "C:\Users\orino\Downloads\WhatsApp Chat with Mike.zip" --project 123-main-st
node scripts/import-whatsapp.mjs "C:\Users\orino\Downloads\WhatsApp Chat with Mike.zip" --vcf "C:\Users\orino\Downloads\Contacts.vcf"
```

## Promote to trusted subs (denote "from Ori", not online)

Contacts land in the review CSV only. To add the real subcontractors into the Subs database
as **trusted** (pinned to the top, tagged `sourcingMethod=ori-personal` — provably distinct
from online-sourced subs): open `knowledge/whatsapp-contacts-extracted.csv`, fill the **`trade`**
column (e.g. `Fencing & Gates`) on the rows that are actual subs, then:

```
node scripts/promote-contacts.mjs --dry-run   # preview what will be added
node scripts/promote-contacts.mjs             # add them
```

Only rows with a trade filled (and a phone or email) are promoted — that's the curation gate;
everyone else stays in the review CSV, untouched.

Run it any time from the `contractor` folder. It talks to the already-running app
on `http://localhost:4373` — no restart needed, nothing else changes.

## Where things land

- **Photos** → uploaded straight into this app's **Photo Feed**, tagged `whatsapp`,
  scoped to `--project <projectId>` (defaults to `whatsapp-inbox` if you skip it —
  pass the real project slug/name when you know which job the chat belongs to).
  Caption is pulled from the chat text around the photo when it can be matched.
  View them at `/photo_feed.html` like any other logged photo.
- **Contacts** → written to `knowledge/whatsapp-contacts-extracted.csv`
  (`name, phone, email, org, chat, firstSeen, lastSeen, source, trade`). `source` is
  `iphone` / `whatsapp` / `google` so hand-given contacts stay distinguishable from
  online-sourced ones; `trade` is the curation column you fill before promoting. This is a
  review file only — **nothing is auto-added to the subs database** until you run
  `promote-contacts.mjs` (see above).

## Notes

- Stickers and tiny/junk images (<30KB) are skipped automatically.
- Re-running the importer on the same export is safe — already-uploaded photos
  (tracked by file hash in `scripts/.import-log.json`) are skipped, and contact
  rows are merged, not duplicated.
- Phone-number extraction is best-effort: WhatsApp only shows a raw number for
  unsaved contacts, or when someone types/shares a number in the chat text. Always
  sanity-check the CSV before trusting a number.
