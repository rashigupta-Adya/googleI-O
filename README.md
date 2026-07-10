# GIO Connect — Adya booth funnel

Self-contained signup funnel for **Google I/O Connect India 2026** (event 14 July). Three live, web-only products — **Vanij (Build)**, **GTM (Sell)**, **RAS (Think)**. People scan a QR on their phone, sign up in ~25 seconds, and get an email with a one-click link to open the product on a **laptop**.

Built to deploy on **Vercel** (or any Node host) with **no npm dependencies** — just built-in `fetch`/`crypto`.

---

## Routes

| Path | What |
|---|---|
| `/io/` | Chooser — all three platforms (the "all three" QR target) |
| `/io/vanij/` `/io/gtm/` `/io/ras/` | Platform landing pages + signup form |
| `/io/desktop-required/` | Mobile interstitial (reached from the email link on a phone) |
| `POST /api/v1/sheets/submit` | Saves the lead to Google Sheets + sends the E1 email |
| `GET /api/io/open?p=<platform>&lead=<id>` | Tracked redirect: mobile → interstitial, desktop → product signup |

`/` redirects to `/io/`.

---

## Deploy on Vercel

1. **Import** this GitHub repo into Vercel (New Project → Import). No build command or framework needed — it's static + serverless functions under `/api`. Root directory: repo root.
2. **Add environment variables** (Project → Settings → Environment Variables) — see `.env.example`. To go live end-to-end you need:
   - Google Sheets: `GOOGLE_SHEETS_SPREADSHEET_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` (or `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`). The service account must have **edit access** to the spreadsheet. The `gio` and `gio_clicks` tabs are created automatically.
   - Resend: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`.
   - Product URLs: `PRODUCT_SIGNUP_URL_VANIJ` / `_GTM` / `_RAS`.
3. **Deploy.** The pages are live immediately. `SITE_ORIGIN` is **not** required — the email link and redirects auto-derive the domain from the request, so it works on the `*.vercel.app` URL and later on `adya.ai` with no change.

You can deploy in stages: with only the Google Sheets vars set, the **pages load and the form saves leads** right away; add Resend to turn on the email; add the product URLs to complete the desktop handoff.

---

## Email deliverability (do before the event)

The E1 email sends via **Resend**. Before real sends:

1. Add your sending domain in Resend (region: **Tokyo** is closest to India; deliverability is the same across regions).
2. Add the **SPF, DKIM, DMARC** DNS records Resend generates, on that domain.
3. Verify the domain, then set `RESEND_FROM` to an address on it.
4. Test-send to Gmail / Outlook and confirm **Primary, not Promotions**.

If email isn't set up yet, leads are still captured — the send just no-ops and is logged.

---

## Local check

```bash
npm run check   # syntax-checks every serverless handler and browser script
```

To run the functions locally, use the Vercel CLI: `vercel dev` (serves the pages and `/api/*` together).

---

## How it works

`serverless/*.cjs` holds the platform-agnostic logic; the files under `api/` are thin Vercel adapters that call it. So the same handlers can run on Netlify or any Node host by swapping the adapter — nothing in `serverless/` is Vercel-specific.

- **Idempotent tracked redirect, no magic-link token.** The email link goes to `/api/io/open`, which logs the click + device and 302s (mobile → interstitial, desktop → product). It's safe to open on phone then laptop — no token to consume, so nobody gets locked out.
- **Lead safety.** The email send is wrapped so a mail failure never loses a lead — the row is already written.
- **Bot defence** is a honeypot field (primary). The per-IP rate limiter is **off by default** because a venue shares one wifi IP; turn it on with `GIO_RATE_LIMIT=on` only if needed.

---

## Fonts / weight

Each page is self-contained: inline critical CSS, the Adya logo inlined as a data-URI, one self-hosted Inter subset (`io/assets/fonts/inter-latin.woff2`), one shared `io-form.js`. A platform page is **~80KB uncompressed** — well under a 200KB / 3G budget. No Google Fonts, Tailwind, or icon libraries.
