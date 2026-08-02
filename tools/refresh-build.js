// Recapture a "Real Builds" card screenshot, both formats, in one go.
//
// Doing this by hand is how the jpg got refreshed on 2026-07-29 while the avif
// stayed three weeks old — and since browsers prefer the avif, most visitors
// would have kept seeing the stale image. This writes both, so they cannot
// drift apart; check-builds.py fails the build if they ever do.
//
//   node tools/refresh-build.js <url> <output-basename> [--fonts <dir>]
//   node tools/refresh-build.js https://reformpilates.fit build-kavita
//
// Framing is 1280x800 at 1.5x = 1920x1200, matching the card's declared
// width/height so it stays crisp on retina.
//
// SANDBOX NOTE: the agent sandbox's browser reaches neither external hosts nor
// fonts.googleapis.com. There, serve the client's built files locally, pass the
// localhost URL, and add `--fonts <dir>` pointing at a directory holding the
// Google Fonts CSS (as jost.css) plus its .woff2 files — e.g. the vendored set
// in kavita-pilates/tools/fonts. On a normal machine, omit it.

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const fontsIdx = argv.indexOf('--fonts');
const FONT_DIR = fontsIdx !== -1 ? argv.splice(fontsIdx, 2)[1] : null;
const [url, base] = argv;
if (!url || !base) {
    console.error('usage: node tools/refresh-build.js <url> <output-basename> [--fonts <dir>]');
    process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const jpg = path.join(ROOT, base + '.jpg');
const avif = path.join(ROOT, base + '.avif');

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });

    if (FONT_DIR) {
        // Serve the requested families only, so a page asking for a font the
        // mirror lacks still fails the check below rather than passing on a
        // bundle it never requested.
        await p.route('**://fonts.googleapis.com/**', r => {
            const all = fs.readFileSync(path.join(FONT_DIR, 'jost.css'), 'utf8');
            const want = [...new URL(r.request().url()).searchParams.getAll('family')]
                .map(f => f.split(':')[0].replace(/\+/g, ' '));
            const css = !want.length ? all : all.split('@font-face')
                .filter(bl => want.some(w => bl.includes(`font-family: '${w}'`)))
                .map(bl => '@font-face' + bl).join('\n');
            r.fulfill({ contentType: 'text/css', body: css });
        });
        await p.route('**://fonts.gstatic.com/**', r => {
            const f = path.join(FONT_DIR, path.basename(new URL(r.request().url()).pathname));
            fs.existsSync(f) ? r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(f) }) : r.abort();
        });
    }

    await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);

    // A screenshot in fallback fonts misrepresents the client's actual site.
    const missing = await p.evaluate(() => {
        const wanted = new Set();
        document.querySelectorAll('body *').forEach(el => {
            if (!el.offsetParent || !(el.textContent || '').trim()) return;
            const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
            if (f) wanted.add(f);
        });
        const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
        const generic = ['sans-serif', 'serif', 'cursive', 'monospace', 'system-ui', 'inherit'];
        return [...wanted].filter(w => !generic.includes(w) && !loaded.includes(w));
    });
    if (missing.length) {
        console.error('Refusing to capture — webfonts not loaded: ' + missing.join(', '));
        await b.close();
        process.exit(1);
    }

    await p.waitForTimeout(3000);   // let entrance animations settle

    // Overlays are the client's chrome, not what we are showcasing. Named
    // selectors ONLY — a substring match like [class*="cookie"] also hits
    // <body class="cookie-open">, which deletes the entire page and yields a
    // blank capture the script will happily call a success.
    await p.evaluate(() => document.querySelectorAll('.cookie-banner, .sticky-cta')
        .forEach(n => n.remove()));
    await p.waitForTimeout(300);

    // Prove there is still a page before spending a screenshot on it.
    // Null-safe: an over-broad removal selector can take <body> itself with it,
    // and then this guard would throw instead of reporting the problem.
    const alive = await p.evaluate(() => ({
        children: document.body ? document.body.children.length : 0,
        text: document.body ? (document.body.innerText || '').trim().length : 0,
    }));
    if (alive.children < 2 || alive.text < 200) {
        console.error(`Refusing to capture — page looks empty after cleanup `
            + `(${alive.children} children, ${alive.text} chars of text).`);
        await b.close();
        process.exit(1);
    }

    await p.screenshot({ path: jpg, type: 'jpeg', quality: 90 });
    await b.close();

    // A 1920x1200 screenshot of a real page is never this small; if it is,
    // something rendered blank and the "captured" line would be a lie.
    const kb = fs.statSync(jpg).size / 1024;
    if (kb < 40) {
        console.error(`Refusing to keep ${base}.jpg — only ${kb.toFixed(0)}KB, almost certainly blank.`);
        fs.unlinkSync(jpg);
        process.exit(1);
    }

    execFileSync('python3', ['-c',
        `from PIL import Image; Image.open(${JSON.stringify(jpg)}).save(${JSON.stringify(avif)}, "AVIF", quality=62)`]);

    console.log(`captured ${base}: jpg + avif written from ${url}`);
    console.log('now run: python3 tools/check-builds.py --update');
})();
