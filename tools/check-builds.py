#!/usr/bin/env python3
"""Guard the KaizenForge "Real Builds" cards against going stale.

Why this exists (2026-07-29): Kavita's card sat on our sales page pointing at
`kavita-pilates.vercel.app` with a screenshot advertising "DROP-IN FROM £20"
— a price she had stopped charging, next to a hero design that no longer
existed. Six substantial passes on her site and nothing prompted us to look.
Rahaid spotted it by eye. A portfolio card is a CLAIM ABOUT A CLIENT and it
decays silently, so it needs a check rather than someone's memory.

What it catches:

  1. The visible URL in the browser frame not matching the actual href
     (the ".vercel.app on a sales page" bug).
  2. A card linking somewhere that no longer returns 200.
  3. A jpg refreshed without its avif, or vice versa. Modern browsers prefer
     the avif, so a half-refresh silently keeps serving the old image to
     most visitors — which is worse than not refreshing at all.
  4. The client's live site having materially changed since the screenshot
     was captured: prices, page title, or hero heading. Those are the things
     a viewer can READ in the thumbnail, so they are the things that make it
     a lie.

    python3 tools/check-builds.py            # check, exit 1 on problems
    python3 tools/check-builds.py --update   # accept current state as the baseline
                                             # (run this straight after recapturing)

Network calls go through curl so the agent proxy is honoured.
"""
import json
import re
import subprocess
import sys
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = Path(__file__).resolve().parent / "builds-manifest.json"

CARD = re.compile(
    r'<a class="build-card" href="(?P<href>[^"]+)".*?'
    r'class="build-url">(?P<shown>[^<]+)<.*?'
    r'srcset="(?P<avif>[^"]+)".*?src="(?P<jpg>[^"]+)"',
    re.S,
)


def fetch(url):
    r = subprocess.run(
        ["curl", "-sS", "--max-time", "25", "-L", "-w", "\n__STATUS__%{http_code}", url],
        capture_output=True, text=True,
    )
    body, _, status = r.stdout.rpartition("\n__STATUS__")
    return status.strip(), body


def fingerprint(html):
    """The parts of a client's site a viewer can actually READ in a thumbnail.

    Deliberately narrow. Hashing the whole page would fire on every deploy and
    train us to ignore it; these three move only when something a prospect
    would notice has changed.
    """
    # Decode entities FIRST. Prices are written &pound;25 in this markup, so a
    # regex for the literal £ found nothing and the price check — the whole
    # reason this script exists — silently passed on an empty list.
    text = unescape(html)
    title = re.search(r"<title>(.*?)</title>", text, re.S)
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", text, re.S)
    strip = lambda t: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t or "")).strip()
    return {
        "title": strip(title.group(1) if title else ""),
        "h1": strip(h1.group(1) if h1 else "")[:120],
        "prices": sorted(set(re.findall(r"£\s?\d[\d,]*", text))),
    }


def main():
    update = "--update" in sys.argv
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    problems, notes = [], []

    cards = []
    for page in sorted(ROOT.glob("*.html")):
        for m in CARD.finditer(page.read_text(encoding="utf-8")):
            cards.append((page.name, m.groupdict()))

    if not cards:
        print("No build cards found — has the markup changed?")
        return 1

    for page, c in cards:
        href, shown = c["href"], c["shown"].strip()
        host = re.sub(r"^https?://(www\.)?", "", href).rstrip("/")

        # 1. Frame text must match where the link actually goes.
        if shown.lower() != host.lower():
            problems.append(f'{page}: frame shows "{shown}" but links to "{host}"')

        # 3. Both image formats must be refreshed together.
        for key in ("jpg", "avif"):
            f = ROOT / c[key]
            if not f.exists():
                problems.append(f"{page}: {c[key]} is missing")
        jpg, avif = ROOT / c["jpg"], ROOT / c["avif"]
        if jpg.exists() and avif.exists():
            skew = abs(jpg.stat().st_mtime - avif.stat().st_mtime)
            if skew > 3600:
                problems.append(
                    f"{page}: {c['jpg']} and {c['avif']} differ by {skew/3600:.1f}h — "
                    "one was refreshed without the other, and browsers prefer the avif"
                )

        # 2 + 4. The target must resolve, and must still look like the screenshot.
        status, html = fetch(href)
        if status != "200":
            problems.append(f"{page}: {href} returned {status}")
            continue

        now = fingerprint(html)
        was = manifest.get(href)
        if update or was is None:
            manifest[href] = now
            notes.append(f"{href}: baseline {'updated' if was else 'recorded'}")
            continue
        for field in ("title", "h1", "prices"):
            if now[field] != was[field]:
                problems.append(
                    f"{page}: {host} changed its {field} since the screenshot was taken — "
                    f"was {was[field]!r}, now {now[field]!r}. Recapture the card."
                )

    if update or any("recorded" in n for n in notes):
        MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    for n in notes:
        print("  ·", n)
    if problems:
        print(f"\nBUILD CARDS STALE ({len(problems)}):")
        for p in problems:
            print("  -", p)
        return 1
    print(f"\nBUILD CARDS OK — {len(cards)} card(s) checked against the live sites")
    return 0


if __name__ == "__main__":
    sys.exit(main())
