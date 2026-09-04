/* 改善 — a continuous vertical current down the right edge, on screen at all times.
 *
 * Rahaid, 2026-09-04: "I want that to be visible at all times, it should flow down as the
 * user scrolls down and vice versa." Diego proposed the kanji; this is the second build.
 * The first put one glyph per section as a background layer — discrete, faint, and absent
 * for most of the page. This is one unbroken ribbon fixed to the viewport.
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
    '.kz-river{position:fixed;top:0;right:0;height:100vh;pointer-events:none;z-index:5;',
    '  overflow:hidden;mix-blend-mode:multiply}',
    '.kz-river svg{position:absolute;top:0;display:block;will-change:transform,opacity}',
    '.kz-river path{fill:#DAD5CB}',
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
    // Sized off the viewport, then pulled right so a fixed share hangs past the edge.
    // Measured rather than guessed: the content gutter is 160px at 1440, 80px at 1280 and
    // ZERO at 1024 and below, so there is no lane to sit in on most screens. The overhang
    // keeps it clear of the column; the blend mode covers everything the overhang cannot.
    var vw = window.innerWidth;
    narrow = vw < 720;
    // On a phone the first build ran the SAME proportion as desktop, which produced a
    // character every 122px — a dense decorative border running down the line-ends of the
    // body copy. Rendered at 390px it read as clutter. Narrow screens get FEWER and BIGGER
    // characters with more of each one off the edge: same presence, a quarter of the
    // events per screen, and the ragged right of the text column stays clean.
    size = narrow ? Math.round(Math.min(vw * 0.52, 260))
                  : Math.round(Math.min(vw * 0.30, 400));
    var hang = narrow ? 0.62 : 0.42;
    var visible = Math.round(size * (1 - hang));
    pitch = Math.round(size * (narrow ? 1.22 : 1.04));

    river.style.width = visible + 'px';
    river.innerHTML = '';
    tiles.length = 0;

    // One tile more than fills the viewport, so a whole character is always entering at
    // each end and the wrap is never visible.
    count = Math.ceil(window.innerHeight / pitch) + 3;
    for (var i = 0; i < count; i++) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 2048 2048');
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.style.left = -Math.round(size * hang) + 'px';
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
      var y = i * pitch - pitch + off;
      var centre = y + size / 2;
      // Weight by distance from the reader's eyeline, eased so the falloff is a curve
      // rather than a ramp.
      var d = Math.min(Math.abs(centre - mid) / (vh * 0.62), 1);
      var w = 1 - d * d;
      var t = tiles[i];
      t.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
      // Narrow screens carry it lighter: there is no gutter, so the ribbon is always
      // beside live text rather than beside whitespace. Body copy wins over scenery.
      t.style.opacity = ((0.34 + 0.66 * w) * (narrow ? 0.72 : 1)).toFixed(3);
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
