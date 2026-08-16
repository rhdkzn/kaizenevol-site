# funnel-check.mjs — step-level tracking regression check

Drives the real multi-step lead forms in headless Chromium and asserts the funnel
tracker (`script.js`) still reports every step. **Verified red-green on
2026-08-16**: neutering the MutationObserver made "advanced past step 1" fail,
restoring it made it pass. It has failed at least once on purpose, so it is a
guard rather than decoration.

## Run

```bash
python3 -m http.server 8899 &                      # serve the site root
PATH="/opt/node22/bin:$PATH" node tools/funnel-check.mjs contact.html
```

Exit 0 = all checks pass. Pass any page carrying a `.lf-step` form.

All nine as of 2026-08-16: `contact index kaizenreach kaizendesk kaizenforge
kitchen bathroom loft roi`.

## What it asserts

`view` and `step:1` on load · the chip label when a chip step exists · advance to
`step:2` · a real POST to `/api/submit-lead` · a `submit` event only on success ·
Back does not double-count · no duplicate events.

It is shape-agnostic — it fills whatever visible inputs the current step has and
clicks whatever advances it — so it works on 2-, 3- and 4-step forms and on pages
carrying more than one form (`kaizenreach` has two). A new page gets covered by
adding its filename to the run, nothing else.

Both APIs are stubbed by the check, so running it writes nothing real.
