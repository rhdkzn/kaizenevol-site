/* Scroll-scrubbed film for the closing section.
 *
 * IT IS AN IMAGE SEQUENCE, NOT A VIDEO — and that is the whole point.
 *
 * It was a <video> seeked by currentTime from a Blob, which is the textbook
 * technique and which measured perfectly in every test I ran. Rahaid then sent
 * a photograph of it sitting dead still on his iPhone. The battery icon in that
 * screenshot is YELLOW: Low Power Mode, in which iOS refuses to decode video at
 * all. Nothing seeks, nothing paints, and the visitor looks at a frozen poster.
 * Separately, iOS will not repaint a <video> on a currentTime assignment until
 * that element has been played at least once — so even outside Low Power Mode
 * the first frame was all some phones ever saw. Every measurement I had was in
 * headless Chromium, which has neither constraint.
 *
 * Two attempts to rescue the video approach were measured and rejected:
 * priming the decoder with a muted play()/pause() (does nothing in Low Power
 * Mode, which is the case in front of us), and drifting the poster with a
 * transform (measured 10.5 of 255 on phone, 3.5 on desktop — the still is a
 * smooth dark image, so sliding it changes almost no pixel values).
 *
 * A sprite sheet moved by background-position has no decoder in the path. No
 * codec negotiation, no autoplay policy, no Low Power Mode veto, no iOS seek
 * quirk. It is also SMALLER than what it replaces: 119KB on mobile against the
 * 244KB mp4 an iPhone was downloading.
 *
 * Two details that are not obvious:
 *
 *   Geometry is computed in PIXELS, not percentages. A percentage
 *   background-size stretches each tile to the element's aspect ratio; the
 *   tiles are 16:9 and the section is roughly 390x680 on a phone. The maths
 *   below is object-fit: cover, done by hand, so a tile is cropped exactly as
 *   the video was and lands on the same 62% horizontal anchor.
 *
 *   The sprite is fetched as an Image and only swapped in on decode. A
 *   background-image assigned before the bytes arrive paints nothing and the
 *   poster would blink out from under it.
 *
 * brand/DESIGN.md is explicit that a visitor with Reduce Motion on gets EXACTLY
 * the same motion as everyone else, and this beat is gesture-driven — it moves
 * only when the visitor's own thumb moves, which is the case DESIGN.md names as
 * must-always-ship. There is deliberately no prefers-reduced-motion branch here
 * and test-reduced-motion.mjs enforces its absence. The one matchMedia below is
 * a VIEWPORT-WIDTH query picking the smaller sprite, not a motion preference.
 */
(function () {
  var section = document.querySelector('[data-scrub]');
  if (!section) return;

  var layer = section.querySelector('.scrub-frames');
  if (!layer) return;

  var wantMobile = window.matchMedia('(max-width: 860px)').matches;
  var src = wantMobile ? layer.dataset.spriteMobile : layer.dataset.sprite;
  var tile = (wantMobile ? layer.dataset.tileMobile : layer.dataset.tile || '').split('x');
  var cols = +layer.dataset.cols;
  var rows = +layer.dataset.rows;
  var count = +layer.dataset.frames;
  var tw = +tile[0];
  var th = +tile[1];
  if (!src || !cols || !rows || !count || !tw || !th) return;

  /* Save-Data and 2g get the poster and nothing else. A still frame is the
     designed fallback, not a degraded one, and it is not worth 119KB of
     somebody's metered plan. */
  function tooExpensive() {
    var c = navigator.connection;
    if (!c) return false;
    return c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g';
  }

  var ready = false;
  var loading = false;
  var target = 0;
  var current = 0;
  var frame = 0;
  var lastIndex = -1;
  var geom = null;

  // object-fit: cover, by hand, in pixels — see the note above.
  function measure() {
    var w = section.offsetWidth;
    var h = section.offsetHeight;
    if (!w || !h) return null;
    var scale = Math.max(w / tw, h / th);
    var fw = tw * scale;
    var fh = th * scale;
    return {
      w: w, h: h, fw: fw, fh: fh,
      // object-position: 62% center, matching what the video used.
      ox: (w - fw) * 0.62,
      oy: (h - fh) * 0.5,
    };
  }

  function apply(p) {
    if (!ready || !geom) return;
    var i = Math.round(p * (count - 1));
    if (i < 0) i = 0;
    if (i > count - 1) i = count - 1;
    if (i === lastIndex) return;
    lastIndex = i;
    var col = i % cols;
    var row = (i - col) / cols;
    layer.style.backgroundPosition =
      (geom.ox - col * geom.fw).toFixed(2) + 'px ' +
      (geom.oy - row * geom.fh).toFixed(2) + 'px';
    /* The frame index, published. background-position is the real applied
       state, but recovering an index from it means knowing the object-position
       offset baked into the same number. This is that index, honestly, and it
       makes the mechanism inspectable in a browser as well as in a test. */
    section.dataset.scrubFrame = i;
  }

  function load() {
    if (loading || tooExpensive()) return;
    loading = true;
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () {
      geom = measure();
      if (!geom) { section.dataset.scrubFailed = 'true'; return; }
      layer.style.backgroundImage = 'url("' + src + '")';
      layer.style.backgroundSize = (geom.fw * cols).toFixed(2) + 'px ' + (geom.fh * rows).toFixed(2) + 'px';
      ready = true;
      lastIndex = -1;
      apply(current);
      section.dataset.scrubPainted = 'true';
    };
    img.onerror = function () {
      // The poster stays. A missing film costs the motion, never the copy.
      section.dataset.scrubFailed = 'true';
    };
    img.src = src;
  }

  /* THE FILM RUNS FROM THE MOMENT THE SECTION APPEARS TO THE MOMENT THE PAGE
     BOTTOMS OUT — the same journey on every page.

     Rahaid: "that black loops animation isn't consistent." It wasn't. The old
     mapping was the section's own travel through the viewport, which assumes
     the section can scroll all the way PAST the viewport. The closing is the
     last thing before the footer, so it never can: you run out of page first.
     Measured at 390px, what each page actually reached: index 87% of the film
     over 1430px, the four question pages 93% over 1266px, the two landing pages
     86% over 1195px. Three speeds, three stopping points, and the end of the
     clip unreachable everywhere. The section is 522-791px tall across the set
     and the footer 638-657px, and those two numbers were setting the
     choreography.

     Measuring the SCROLL RANGE instead removes both. */
  function progress() {
    var top = section.getBoundingClientRect().top + window.pageYOffset;
    var enter = top - window.innerHeight;
    if (enter < 0) enter = 0;
    var end = Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    ) - window.innerHeight;
    var span = end - enter;
    // A viewport tall enough to hold the section and the footer at once leaves
    // nothing to scrub against; show the film complete rather than frozen at 0.
    if (span < 8) return 1;
    var p = (window.pageYOffset - enter) / span;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  function nearViewport() {
    var rect = section.getBoundingClientRect();
    return rect.top < window.innerHeight * 2 && rect.bottom > -window.innerHeight;
  }

  function tick() {
    frame = 0;
    // Ease toward the target so a flung scroll does not machine-gun the layer.
    current += (target - current) * 0.18;
    if (Math.abs(target - current) < 0.0008) current = target;
    apply(current);
    if (current !== target) schedule();
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(tick);
  }

  function onScroll() {
    if (!nearViewport()) return;
    target = progress();
    schedule();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    if (ready) {
      geom = measure();
      if (geom) {
        layer.style.backgroundSize = (geom.fw * cols).toFixed(2) + 'px ' + (geom.fh * rows).toFixed(2) + 'px';
        lastIndex = -1;
        apply(current);
      }
    }
    onScroll();
  }, { passive: true });
  onScroll();

  /* THE DOWNLOAD STARTS ON IDLE, NOT AT TWO VIEWPORTS.
     Rahaid: "some of the pages the black loop is static." Measured, cold, on a
     throttled connection: time from reaching the closing to the first moving
     frame was 1.6s on fast 4G and 8.7s on slow 4G, on EVERY page. The effect was
     built for the home page, which is 10,032px tall, so the two-viewport trigger
     fired thousands of pixels and several seconds before the visitor arrived and
     the fetch always won. The question pages are 3,376-4,582px: the closing is a
     third of the way down the same scroll, so the same fetch had a third of the
     runway and lost. So it is fetched while the visitor is reading, which is the
     time the short pages do have. */
  if (!tooExpensive()) {
    if (window.requestIdleCallback) requestIdleCallback(load, { timeout: 2500 });
    else setTimeout(load, 1200);
  }
})();
