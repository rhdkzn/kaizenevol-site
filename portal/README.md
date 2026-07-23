# KaizenEvol client portal (frontend)

The standalone client dashboard — its own app, its own domain (`app.kaizenevol.com`), decoupled from the KaizenDesk backend. A single static `index.html`: it reads `?tenant=…&key=…` from the URL, fetches the backend JSON API, and renders the client's dashboard (Desk view or Reach view). No build step, no framework.

## How it fits together
```
app.kaizenevol.com/?tenant=X&key=Y   (this static app, on Vercel)
        │  fetch
        ▼
{DESK_BACKEND}/api/portal/X?key=Y      (KaizenDesk on Railway — JSON, per-tenant key gate)
```
The backend is the single source of truth (`kaizendesk/portal.py:portal_data`). This app only renders. A client's link never shows another client's data — the key is per-tenant and checked on the backend.

## Deploy (one-time)
1. **Point the app at the backend.** In `index.html`, either edit the `API_BASE` constant, or add to `<head>`:
   ```html
   <meta name="api-base" content="https://YOUR-DESK-BACKEND.up.railway.app">
   ```
2. **Vercel project** rooted at this `portal/` folder (or serve the repo and route `app.kaizenevol.com` here). It's static, so any static host works.
3. **DNS:** point `app.kaizenevol.com` at the Vercel deployment.
4. **On the KaizenDesk backend (Railway), set the env var:**
   ```
   PORTAL_ORIGIN=https://app.kaizenevol.com
   ```
   This is what unlocks the browser to read the JSON API (CORS is locked to exactly this origin — never `*`, because the API returns a client's leads).

## The client's link
`https://app.kaizenevol.com/?tenant={tenant_id}&key={portal_key}` — `onboard.py` generates the `portal_key`; drop the link in the welcome doc or a WhatsApp alert.

## Notes
- Client data (names, numbers, campaign names) is inserted as **text**, never HTML, so a lead's message can't inject markup.
- `noindex` — this is private, not for search engines.
- Reach numbers come from the tenant's `reach` block on the backend (Prism-fed; live Meta/Metricool sync is the later upgrade).
