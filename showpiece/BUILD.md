# Walkthrough master — build recipe (v3, 2026-08-15)

> Exists because v2's recipe died with its session scratchpad and reverse-engineering it
> (frame-signature alignment) failed against its baked-in retiming/zoom. Any change to the
> walkthrough media updates THIS file in the same commit (OPS-LRN-001, 2026-08-15).

**Source clips** — Higgsfield minimax_h3, 2K, stored in the account (re-downloadable free,
`show_generations`), 158 frames @24fps each, native 2144x1440 (kitchen 2176x1440):
1. `50ace432` hallway/doors → 2. `36276be5` kitchen → 3. `ff8359de` bathroom → 4. `9fa88357` loft (last frame trimmed)

**Master (595 frames, 24.79s):** normalize `crop=2144:1440,fps=24,setsar=1`, then chain
`xfade=transition=zoomin:duration=0.5` at offsets 6.0833 / 12.1667 / 18.25. Mezzanine x264 crf 10.

**Tiers (all bt709-tagged, yuv420p, `-g 8`):**
- 1440: native 2144x1440 — h264 crf 18 +faststart / vp9 crf 27 -b:v 0 -row-mt 1
- 1080: `scale=1920:-2,crop=1920:1080` — h264 crf 19 / vp9 crf 29
- 540: `scale=960:-2,crop=960:540` — h264 crf 22 / vp9 crf 33

**Gates:** frame count 595 on all six outputs · seam windows show a smooth ~12-frame delta ramp
(designed zoomin motion), never an isolated single-frame spike (that's a cut) · contact-sheet
eyeball (rule 14) · live: 206 on a range request + Content-Length equals local byte size.

**Page tier pick** (walk.html / walk-forge.html / showpiece.html, identical block):
`phys = max(screen.w,h) × devicePixelRatio` → <1000 or save-data/2g = 540 · <2000 = 1080 · else 1440.
Beat windows for THIS master (seams at .255/.501/.746): `[[0,.21],[.28,.47],[.53,.71],[.78,.97]]`.
