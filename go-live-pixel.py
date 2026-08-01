#!/usr/bin/env python3
"""Turn the Meta pixel on — privacy notice and pixel ID in ONE step.

    python3 go-live-pixel.py 1234567890123456

WHY THIS IS A SCRIPT AND NOT TWO EDITS. Mike Ross's pre-launch review (2026-08-01)
was explicit about sequencing: publish the notice and set the pixel ID in the same
deployment. Publish the notice early and you are claiming to run a pixel you do not
run. Publish it late and the site is tracking people while the notice says it is not,
which is the worse direction. A script makes it one action that cannot half-happen.

Until this is run: PIXEL_ID is blank, script.js does nothing, no banner shows, no
cookie is set, and privacy.html's "does not currently use advertising or analytics
cookies" is TRUE. That is a consistent, honest state — which is why it was left
that way rather than shipping the notice ahead of the ID.

BEFORE RUNNING, two things Mike flagged that only a human can check:
  1. Open Meta Ads Manager and confirm the retention on your website custom
     audiences. The notice below states 180 days. If yours differs, change it here
     first — do not publish a figure nobody has looked at.
  2. If you want to name Meta's transfer safeguard explicitly, confirm Meta
     Platforms' listing on the UK Extension to the EU-US Data Privacy Framework.
     The wording below is deliberately written to stay true either way.

Idempotent: refuses to run twice, and refuses a malformed ID.
"""
import io
import re
import sys
from pathlib import Path

COOKIES_SECTION = """      <section class="legal-block" id="cookies">
        <h2>Cookies and advertising</h2>
        <p>We run ads on Facebook and Instagram. To see which of those ads actually bring people here, we use the <strong>Meta pixel</strong> on this site. It's the only tracking technology we use, and there is nothing else hiding behind it.</p>
        <p><strong>Nothing loads until you accept.</strong> The first time you visit we ask you, once. If you decline, the pixel is never loaded, no advertising cookie is set, and nothing at all goes to Meta. Either way the site works the same, and we don't keep asking on every page.</p>
        <p>If you accept, the pixel records that you visited a page here, and whether you sent us an enquiry. <strong>It does not send Meta your name, email address, phone number, or anything you typed into a form.</strong> What Meta does receive is the technical information any website visit involves: the address of the page, your IP address, your browser and device type, and the identifier held in its own cookie.</p>
        <p>Our lawful basis for this is <strong>your consent</strong>, given through the cookie banner. That's what the Privacy and Electronic Communications Regulations require, and it's why we ask before rather than after.</p>
        <p><strong>Changing your mind.</strong> Use the <strong>Cookie choices</strong> link in the footer of any page. You can switch your answer whenever you like, and it takes exactly as few clicks as saying yes did. Withdrawing stops any further tracking from this site straight away. What it can't do is reach back and undo what Meta already received, so if you want to deal with that as well, the ad settings inside your Facebook or Instagram account are the place to do it.</p>
        <p><strong>Meta's part in this.</strong> For the moment the pixel collects your data and sends it on, we and <strong>Meta Platforms Ireland Limited</strong> are joint controllers, which means we're each responsible for that step. After that, Meta uses the data for its own purposes as sole controller, under <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener">its own privacy policy</a>. That includes transferring it outside the UK, to the United States among other places. Meta is responsible for the safeguards covering those transfers, and its policy sets out what they are.</p>
        <p><strong>How long it's kept.</strong> We don't hold pixel data ourselves. It lives in our Meta advertising account, where our website audiences are set to expire after no more than <strong>180 days</strong>. How long Meta keeps it for its own purposes is governed by its policy, linked above.</p>
        <p><strong>Ordinary site analytics.</strong> Separately, we use Vercel Web Analytics to count page views. It's cookieless, it stores nothing on your device, and it doesn't identify you or follow you between sites, so there's nothing to consent to.</p>
      </section>
"""

# (find, replace, human label) — every one must match exactly once or nothing is written.
EDITS = [
    ("""<p>This site does <strong>not</strong> currently use advertising or analytics cookies, and sets no tracking cookies. Only essential cookies needed for the site to function may be used. If we add advertising measurement in future, we will ask for your consent first and update this policy.</p>""",
     """<p>We also use <strong>one advertising cookie from Meta</strong> (the company behind Facebook and Instagram), and only if you tell us we can. Nothing loads until you say yes, and the site works exactly the same if you say no. There's more detail in <strong>Cookies and advertising</strong> below.</p>""",
     "cookies statement (was false once the pixel is live)"),

    ("""<p>Our lawful basis is <strong>legitimate interest</strong> (responding to an enquiry you initiated) and, where relevant in future, <strong>consent</strong> (for any advertising cookies).</p>""",
     """<p>Our lawful basis is <strong>legitimate interest</strong> (responding to an enquiry you started). For advertising cookies it's <strong>consent</strong> — which you give, or don't, through the cookie banner.</p>""",
     "lawful basis ('in future' no longer true)"),

    # Mike Ross F8: Meta is a JOINT CONTROLLER, not a processor. "Only on our
    # instructions" describes a processor and is untrue of Meta, which uses what it
    # receives for its own purposes. Fashion ID (CJEU C-40/17) is the authority.
    ("""          <li><strong>Resend</strong> — email delivery of enquiry notifications to us</li>
        </ul>
        <p>These providers process data only on our instructions and under their own data-protection terms.</p>""",
     """          <li><strong>Resend</strong> — email delivery of enquiry notifications to us</li>
          <li><strong>Meta Platforms Ireland</strong> — advertising measurement, and only if you accepted the cookie banner</li>
        </ul>
        <p>Vercel, Supabase and Resend process data only on our instructions and under their own data-protection terms. <strong>Meta is different</strong>: it isn't simply acting on our instructions, and it uses what it receives for its own purposes as well as ours. There's more on that in <strong>Cookies and advertising</strong> above.</p>""",
     "recipients list + the processor/controller distinction"),

    ("""        <p>Outreach details are kept on the same basis — up to 12 months from when we gathered or last used them, deleted immediately if you reply "stop" or object.</p>""",
     """        <p>Outreach details are kept on the same basis — up to 12 months from when we gathered or last used them, deleted immediately if you reply "stop" or object.</p>
        <p>Advertising data is separate and isn't kept by us at all. See <strong>Cookies and advertising</strong> above.</p>""",
     "retention: pixel data"),

    ("""        <p>If you are unhappy with how we handle your data, you can complain to the UK Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noopener">ico.org.uk</a>.</p>""",
     """        <p>To change your mind about advertising cookies specifically, you don't need to email anyone — use the <strong>Cookie choices</strong> link in the footer of any page.</p>
        <p>If you are unhappy with how we handle your data, you can complain to the UK Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noopener">ico.org.uk</a>.</p>""",
     "rights: how to withdraw consent"),
]


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    pixel = sys.argv[1].strip()
    if not re.fullmatch(r"[0-9]{10,20}", pixel):
        print(f"ERROR: {pixel!r} is not a Meta pixel ID (10-20 digits). Nothing changed.")
        return 2

    root = Path(__file__).parent
    js = root / "script.js"
    pv = root / "privacy.html"

    js_src = io.open(js, encoding="utf-8").read()
    pv_src = io.open(pv, encoding="utf-8").read()

    if "var PIXEL_ID = '';" not in js_src:
        print("ERROR: PIXEL_ID is already set. Nothing changed.")
        return 1
    if 'id="cookies"' in pv_src:
        print("ERROR: privacy.html already has the cookies section. Nothing changed.")
        return 1

    # Verify every edit lands BEFORE writing anything — no half-applied state.
    for find, _, label in EDITS:
        if pv_src.count(find) != 1:
            print(f"ERROR: '{label}' matched {pv_src.count(find)} times, expected 1. "
                  f"privacy.html has drifted; re-check against the Mike Ross review. Nothing changed.")
            return 1
    anchor = "</section>\n\n      <section class=\"legal-block\">"
    if pv_src.count(anchor) < 1:
        print("ERROR: could not find an insertion point for the cookies section. Nothing changed.")
        return 1

    for find, repl, _ in EDITS:
        pv_src = pv_src.replace(find, repl, 1)
    pv_src = pv_src.replace(anchor, "</section>\n\n" + COOKIES_SECTION + "\n      <section class=\"legal-block\">", 1)
    pv_src = re.sub(r'(<p class="updated">Last updated: )[^<]*(</p>)',
                    r'\g<1>1 August 2026\g<2>', pv_src, count=1)

    io.open(pv, "w", encoding="utf-8").write(pv_src)
    io.open(js, "w", encoding="utf-8").write(
        js_src.replace("var PIXEL_ID = '';", f"var PIXEL_ID = '{pixel}';", 1))

    print(f"Pixel {pixel} set, privacy notice updated. Both files changed together.")
    print("Now: commit and push BOTH, then load /index.html and confirm the banner appears,")
    print("nothing hits Facebook before Accept, and one request does after.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
