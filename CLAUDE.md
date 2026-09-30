# KaizenEvol site — notes for Claude Code

## What this is
kaizenevol.com — the site for KaizenEvol, a creative growth agency for brands and artists.
Two founders, no account managers: **Diego** (content and social, what people see) and
**Law** (ads, retention, tracking, everything underneath). We make the content, run the ads,
grow the social presence, and keep in touch with past buyers.

Positioning the copy must hold to:
- **Five artists and five brands at a time** (Rahaid, 2026-09-30; was five clients). It is the whole capacity, not a launch offer.
- **Judged against two numbers** set before any spend: what a customer is worth, and what
  sales were already doing without us (the Kaizen Loop).
- **We never take a cut of ad spend.** Ad accounts, content and customer lists stay the client's.
- **We say no on the first call** if the numbers don't work.

## Stack
- Static HTML/CSS/JS pages at the repo root (`index.html`, `what-we-run.html`, `kaizen-loop.html`,
  `faq.html`, `apply.html`, landing pages like `tried-ads-before.html`, `ads-for-musicians.html`).
- Internal tools on the same site, noindexed: `crm.html`, `dashboard.html`, `portal.html`, `onboard.html`.
- Serverless functions in `api/` (Vercel). Supabase for data (`db/*.sql`). Keys: see `.env.example`;
  never commit real keys.
- Client demo sites live in `demos/` (e.g. `demos/adz-valeting.html`).
- Hosted on Vercel, project `kaizenevol-site`. **Pushing to `main` deploys to production.**

## How to work here
- Work on a branch and open a PR. Only merge to `main` when Law or Diego says so.
- Run the tests before calling anything done:
  - `npx --yes http-server -p 8899 -s .` then `./run-tests.sh`
  - or `BASE=https://kaizenevol.com ./run-tests.sh` against production
  - If the runner says "CANNOT RUN", that's the harness, not the site. Say so; don't report a verdict.
- Check changes in a real browser at phone width (390px) as well as desktop. Most visitors are on mobile.
- If a check can't actually be run, say that plainly instead of guessing.

## Decisions already made (don't undo without asking)
- **Seat marks show the cap only.** `data-seats="5,5"` (five artists, five brands, drawn as two groups) with no `data-taken`. Only show occupancy
  (`data-taken="N"`) once N is 3 or more. See the comment in `kaizen-mark.css`. (2026-09-28)
- URLs and domains: confirm exact spelling before using them in copy or links.

## Clients and side work (context only)
- Paveny Co (pavenyco.co.uk): friend's baby-essentials Shopify shop. Meta ads only to start,
  paid 5% of monthly revenue. No infant-formula ads (UK rules).
- ADZ Valeting: Bristol mobile valeting, demo at `demos/adz-valeting.html`.
