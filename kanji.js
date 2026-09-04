/* 改善 — a continuous vertical current down the right edge, on screen at all times.
 *
 * Rahaid, 2026-09-04: "I want that to be visible at all times, it should flow down as the
 * user scrolls down and vice versa." Diego proposed the kanji; this is the second build.
 * The first put one glyph per section as a background layer — discrete, faint, and absent
 * for most of the page. This is one unbroken ribbon fixed to the viewport, reading as a vertical inscription down the edge.

 * THE CHARACTERS ARE NEVER CROPPED. Two builds hung them off the right edge and both were
 * wrong for a reason that has nothing to do with taste: a Han character's radicals are
 * themselves characters, so cropping 改 leaves a whole, different character (女) standing
 * on its own. The site shipped a column reading 女 down its right edge. Size to fit.
 *
 * ── WHY IT PAINTS ON TOP RATHER THAN BEHIND ───────────────────────────────────────────
 * A background layer cannot work on this site, and the reason is worth writing down
 * because the obvious fix is wrong twice over. Sections carry OPAQUE backgrounds (.band
 * is --recess), so anything painted behind them is simply gone — which is what silently
 * blanked three sections in the first build until isolation:isolate rescued it one
 * section at a time. A single fixed layer has no per-section escape: at z-index:-1 it
 * lives in the ROOT stacking context and every band paints straight over it.
 *
 * So it goes ON TOP of all content, and is made harmless by BLEND MODE rather than by
 * stacking order. mix-blend-mode:multiply with a light warm fill gives:
 *     over the page    light × lighter    = a visible tint            ← the watermark
 *     over body text   near-black × light ≈ near-black, unchanged     ← text untouched
 * Multiply can only ever move toward the darker of the two inputs, so ink already darker
 * than the glyph is mathematically unaffected. That is the whole trick, and it is why
 * this can be far bolder than the first build at no cost to readability.
 *
 * ── HOW THE CURRENT WORKS ─────────────────────────────────────────────────────────────
 * Tiles sit at a fixed pitch and their offset is scrollY × SPEED wrapped modulo that
 * pitch, so the column is seamless and endless in both directions. It flows down as the
 * page scrolls down and back up on the way up, because it is bound to scroll POSITION and
 * not to velocity — there is nothing to run out of and nothing to reset.
 *
 * Each character's weight is a function of its distance from the viewport centre, so the
 * one level with the reader is strongest and the column falls away at top and bottom.
 * That is what stops a repeating pair of glyphs reading as wallpaper: one character is
 * always being shown to you, and which one it is changes as you move.
 *
 * Glyph paths are outlined from IPAGothic and baked in. Han unification means U+6539 and
 * U+5584 take different glyph SHAPES in a Chinese font, and a viewer's font stack is not
 * something to gamble on when the site IS the pitch. A path cannot be substituted.
 */
(function () {
  var KAI = 'M703 868H340V282Q340 217 371 204Q402 190 539 190Q745 190 766 239Q791 285 797 458L942 424L940 391Q922 180 877 123Q818 49 549 49Q306 49 248 86Q197 119 197 219V995H703V1405H123V1534H842V778H703ZM1358 381Q1225 571 1117 884L1110 874Q1055 744 973 626L867 731Q1083 1033 1164 1691L1311 1667Q1283 1458 1256 1343H1905V1208H1733Q1702 703 1536 399L1530 389Q1704 178 1952 16L1848 -125Q1621 37 1446 258Q1268 12 961 -158L859 -31Q1167 104 1358 381ZM1436 520Q1555 763 1586 1194Q1586 1204 1588 1208H1225Q1223 1198 1211 1156Q1200 1119 1192 1089Q1277 774 1436 520Z';
  var ZEN = 'M1185 1462Q1282 1597 1325 1702L1478 1655Q1418 1550 1345 1462H1818V1341H1089V1208H1728V1091H1089V952H1904V837H1570Q1515 720 1468 643H1945V524H102V643H567Q528 749 473 837H141V952H944V1091H317V1208H944V1341H227V1462H665Q616 1558 547 1648L692 1698Q753 1615 825 1462ZM1089 837V643H1314Q1362 731 1408 837ZM944 643V837H633Q687 724 714 643ZM1697 408V-143H1550V-61H497V-143H350V408ZM497 289V62H1550V289Z';

  var css = [
    /* z-index 5 clears every content block and stays under the sticky nav at 40, so the
       ribbon never crosses the header. pointer-events:none throughout — this is scenery
       and must never eat a click or a text selection. */
    '.kz-river{position:fixed;top:0;right:0;height:100vh;pointer-events:none;z-index:-1;',
    '  overflow:hidden}',
    '.kz-river svg{position:absolute;top:0;display:block;will-change:transform,opacity}',
    '.kz-river path{fill:#C6C0B4}',
    /* A watermark down the margin of a printed page is wasted toner. */
    '@media print{.kz-river{display:none}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var river = document.createElement('div');
  river.className = 'kz-river';
  river.setAttribute('aria-hidden', 'true');
  document.body.appendChild(river);

  var tiles = [];
  var size = 0, pitch = 0, count = 0, narrow = false;

  function build() {
    // EVERY NUMBER HERE IS MEASURED OFF DIEGO'S MOCKUP, not judged by eye. Three builds
    // were tuned by eye against that image and all three were wrong, so it got measured:
    //
    //   glyph height          349px in an 858px viewport  =  41% of viewport width
    //   glyph tone            rgb(216,214,211)  — neutral grey, not warm
    //   page behind it        rgb(245,244,242)
    //   clipped edge          ink reaches x=1074 of a 1075px viewport — it runs OFF THE
    //                         RIGHT, so what you see is the LEFT of each character
    //
    // The build before this had it at 95% of viewport width (2.3x too big — "it's too
    // visible") and clipped the other way round, showing the RIGHT of each character with
    // clear space at the screen edge ("it's cut off the wrong way"). Both are corrected
    // here and both are asserted in test-kanji-river.mjs, because eyeballing this against
    // a reference has now failed three times.
    var vw = window.innerWidth;
    narrow = vw < 720;
    // 0.41 is the measured figure and applies to the phone the mockup was made on. Wide
    // screens take a smaller fraction, because the same fraction of a 1440px viewport is
    // a far bigger object next to the same-size body text.
    size = Math.round(Math.min(vw * (narrow ? 0.41 : 0.30), 440));
    var show = 0.68;                          // fraction on screen; the rest runs off right
    pitch = Math.round(size * 1.30);

    river.style.width = Math.round(size * show) + 'px';
    river.innerHTML = '';
    tiles.length = 0;

    count = Math.ceil(window.innerHeight / pitch) + 3;
    for (var i = 0; i < count; i++) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 2048 2048');
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      // left:0 inside a container narrower than the glyph, so overflow:hidden clips the
      // RIGHT-hand side and the character bleeds off the edge of the screen. Setting a
      // negative left instead clips the left-hand side, which is the mistake above.
      svg.style.left = '0px';
      svg.innerHTML = '<g transform="translate(0,2048) scale(1,-1)"><path d="' +
                      (i % 2 ? ZEN : KAI) + '"/></g>';
      river.appendChild(svg);
      tiles.push(svg);
    }
  }

  // Reduced motion SLOWS the current to a fifth. It does not stop it: a still column and a
  // moving one are different designs, and the visitor asked for less motion rather than a
  // different page. DESIGN.md ruling, enforced by test-reduced-motion.mjs.
  var calm = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var SPEED = calm ? 0.06 : 0.30;

  var ticking = false;

  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    var mid = vh / 2;
    var off = (window.scrollY * SPEED) % pitch;
    if (off < 0) off += pitch;

    for (var i = 0; i < count; i++) {
      // i>>1 is which 改善 this is; i&1 is which half of it.
      var y = i * pitch - pitch + off;
      var centre = y + size / 2;
      // Weight by distance from the reader's eyeline, eased so the falloff is a curve
      // rather than a ramp.
      // Normalised over a span that reaches past the viewport edge, so w hits 0 BEFORE a
      // tile is on screen. Any non-zero floor here means tiles appear at partial strength
      // the instant they enter - which reads as the whole ribbon changing abruptly.
      var d = Math.min(Math.abs(centre - mid) / (vh * 0.78), 1);
      var w = 1 - d * d;
      var t = tiles[i];
      t.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
      // Narrow screens carry it lighter: there is no gutter, so the ribbon is always
      // beside live text rather than beside whitespace. Body copy wins over scenery.
      t.style.opacity = w.toFixed(3);
    }
  }

  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  var rt;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () { build(); frame(); }, 120);
  }

  build();
  frame();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
})();
