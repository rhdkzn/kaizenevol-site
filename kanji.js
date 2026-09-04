/* 改善 — kaizen — as a large architectural watermark down the right edge.
 *
 * Diego proposed it (2026-09-04) and Rahaid backed it. It does NOT replace the small
 * 改 section marker in kaizen-mark.css; the two are different jobs and the mockup
 * carried both. The marker is a detail you find at 14px. This is the ground the page
 * sits on.
 *
 * FOUR THINGS THIS DOES THAT A FADED IMAGE WOULD NOT:
 *
 * 1. FILLED, AT VERY LOW CONTRAST. The first build of this stroked the glyphs as
 *    hairlines instead, on the theory that an outline reads as drawn rather than as a
 *    faded picture. Rendered, it was unreadable — a complex kanji at 1px outline is
 *    technical-drawing noise, and neither character was recognisable. Diego's mockup
 *    had it right: a flat fill at low opacity is legible as a CHARACTER, which is the
 *    entire point of using one. The render overruled the theory.
 *
 * 2. THE CROP IS COMPOSED. Each glyph hangs a fixed 14% of its own width past the
 *    right edge, clipped by the section rather than by the window. Same overhang
 *    every time, so it reads as a decision instead of an accident of viewport width.
 *    The first build hung 30% off and cut the character in half, which is how the
 *    outline version came to look like scattered rectangles.
 *
 * 3. IT IS ANCHORED TO CONTENT. One glyph per qualifying section, alternating 改 / 善,
 *    so the pair reads down the page in order. A single floating watermark drifts out
 *    of any relationship with what is being said next to it.
 *
 * 4. IT NEVER TOUCHES THE HERO. Rahaid's standing ruling: the hero carries the aura
 *    and takes no second background. Nor the closing band, whose rule is centred.
 *
 * Glyph paths are outlined from IPAGothic and baked in, for the same reason
 * kaizen-mark.css bakes its own: Han unification means U+6539 and U+5584 render with
 * different glyph SHAPES in a Chinese font, and a viewer's font stack is not
 * something to gamble a design-competence pitch on. A path cannot be substituted.
 */
(function () {
  var GLYPHS = {
    // 改 U+6539 — change
    kai: 'M703 868H340V282Q340 217 371 204Q402 190 539 190Q745 190 766 239Q791 285 797 458L942 424L940 391Q922 180 877 123Q818 49 549 49Q306 49 248 86Q197 119 197 219V995H703V1405H123V1534H842V778H703ZM1358 381Q1225 571 1117 884L1110 874Q1055 744 973 626L867 731Q1083 1033 1164 1691L1311 1667Q1283 1458 1256 1343H1905V1208H1733Q1702 703 1536 399L1530 389Q1704 178 1952 16L1848 -125Q1621 37 1446 258Q1268 12 961 -158L859 -31Q1167 104 1358 381ZM1436 520Q1555 763 1586 1194Q1586 1204 1588 1208H1225Q1223 1198 1211 1156Q1200 1119 1192 1089Q1277 774 1436 520Z',
    // 善 U+5584 — good, better
    zen: 'M1185 1462Q1282 1597 1325 1702L1478 1655Q1418 1550 1345 1462H1818V1341H1089V1208H1728V1091H1089V952H1904V837H1570Q1515 720 1468 643H1945V524H102V643H567Q528 749 473 837H141V952H944V1091H317V1208H944V1341H227V1462H665Q616 1558 547 1648L692 1698Q753 1615 825 1462ZM1089 837V643H1314Q1362 731 1408 837ZM944 643V837H633Q687 724 714 643ZM1697 408V-143H1550V-61H497V-143H350V408ZM497 289V62H1550V289Z'
  };

  var css = [
    /* Height-clamped as well as width-clamped: a glyph taller than its section gets
       sliced top and bottom by the host's overflow:hidden and stops reading as a
       character. min() against a section-relative height keeps it whole. */
    '.kz-glyph{position:absolute;top:34%;right:0;width:min(38vw,420px);aspect-ratio:1;',
    '  pointer-events:none;z-index:-1;opacity:0;',
    '  transform:translate(14%,-50%);will-change:transform,opacity;',
    '  transition:opacity 1.1s cubic-bezier(.22,1,.36,1)}',
    '.kz-glyph.in{opacity:1}',
    '.kz-glyph svg{display:block;width:100%;height:100%;overflow:visible}',
    /* Ink at low alpha, not a flat grey: it picks up the warmth of the page rather than
       going cold against it. Measured, not guessed - at .045 the band copies were
       invisible in a render while the plain sections read fine, because --recess sits
       closer to the fill than --page does. The band gets its own value. */
    '.kz-glyph path{fill:#23211E;fill-opacity:.062;stroke:none}',
    '.band .kz-glyph path{fill-opacity:.085}',
    /* isolation:isolate is load-bearing, not tidiness. A z-index:-1 child only paints
       ABOVE its parent's own background when that parent forms a stacking context.
       position:relative alone does not form one, so on .band - which carries an opaque
       --recess background - the glyph fell into the ROOT stacking context and was
       painted underneath the band entirely. Three band sections rendered blank while
       the transparent ones looked fine, which is exactly how this hides. */
    '.kz-host{position:relative;overflow:hidden;isolation:isolate}',
    /* Reduce-motion SHORTENS the arrival and slows the drift (handled in JS); it never
       removes either. DESIGN.md ruling, and test-reduced-motion.mjs enforces it. */
    '@media(prefers-reduced-motion:reduce){.kz-glyph{transition-duration:.2s}}',
    /* Under 720px the text column is full-bleed, so there is no whitespace lane to put
       the glyph in - it lands behind the copy whatever we do. Rendered on a 390px
       viewport it was legible but sat right under the lede, so on mobile it hangs
       further off the edge AND drops in contrast. Body copy wins over decoration. */
    '@media(max-width:719px){.kz-glyph{width:54vw;transform:translate(34%,-50%)}',
    '  .kz-glyph.in{opacity:.4}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Every section except the hero (which carries the aura) and the closing band
  // (centred rule — a glyph off one side of it reads as a mistake).
  var hosts = [].slice.call(document.querySelectorAll('section:not(.closing)'));
  if (!hosts.length) return;

  var order = ['kai', 'zen'];
  var layers = [];

  hosts.forEach(function (host, i) {
    host.classList.add('kz-host');
    var el = document.createElement('div');
    el.className = 'kz-glyph';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<svg viewBox="0 0 2048 2048" xmlns="http://www.w3.org/2000/svg">' +
      '<g transform="translate(0,2048) scale(1,-1)">' +
      '<path d="' + GLYPHS[order[i % 2]] + '"/></g></svg>';
    host.appendChild(el);
    layers.push({ el: el, host: host });
  });

  // Height clamp. A glyph taller than its host is sliced by the host's overflow:hidden,
  // and a sliced character stops being a character. 86% leaves it breathing room inside
  // the section rather than touching both edges.
  function fit() {
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      var cap = l.host.clientHeight * 0.86;
      l.el.style.width = '';                       // back to the CSS value first
      var natural = l.el.getBoundingClientRect().width;
      if (natural > cap) l.el.style.width = Math.round(cap) + 'px';
    }
  }
  fit();

  // Arrival: each glyph fades in as its section comes up.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.querySelector('.kz-glyph').classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    layers.forEach(function (l) { io.observe(l.host); });
  } else {
    layers.forEach(function (l) { l.el.classList.add('in'); });
  }

  // Parallax. The glyph moves slower than the page, so it sits behind the content
  // rather than travelling with it. Reduced motion SLOWS this to a quarter — it does
  // not switch it off, because a static glyph and a moving one are different designs
  // and the visitor asked for less motion, not a different page.
  var calm = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var DRIFT = calm ? 0.022 : 0.088;
  // The parallax rewrites transform every frame, so it has to carry the same
  // mobile overhang the stylesheet sets - otherwise the media query is undone
  // by the first scroll event and the glyph walks back under the copy.
  var mq = window.matchMedia('(max-width:719px)');
  var ticking = false;

  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      var r = l.host.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      // Progress of this section through the viewport, -1 .. 1 about the centre.
      var p = ((r.top + r.height / 2) - vh / 2) / vh;
      var y = -p * vh * DRIFT;
      var ox = mq.matches ? '34%' : '14%';
      l.el.style.transform = 'translate(' + ox + ',calc(-50% + ' + y.toFixed(1) + 'px))';
    }
  }

  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function(){ fit(); onScroll(); }, { passive: true });
  frame();
})();
