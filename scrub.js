/* Scroll-scrubbed film for the closing section.
 *
 * Written for this estate rather than lifted from Higgsfield's React engine:
 * theirs branches on prefers-reduced-motion, and brand/DESIGN.md is explicit
 * that a visitor with Reduce Motion on gets EXACTLY the same motion as
 * everyone else. There is deliberately no prefers-reduced-motion branch in
 * this file — the motion here is gesture-driven, moving only when the
 * visitor's own thumb moves, which is the case DESIGN.md names as
 * must-always-ship. test-reduced-motion.mjs enforces the absence.
 *
 * The one matchMedia below is a VIEWPORT-WIDTH query picking the mobile
 * encode, not a motion preference. Naming that distinction here because the
 * first version of this file's own guard banned matchMedia wholesale and
 * would have failed on it — a guard that bans the mechanism rather than the
 * behaviour is one you end up disabling, which is how the reduce-motion bug
 * came back four times.
 *
 * The one non-obvious mechanic: the clip is fetched into a Blob and played
 * from a blob: URL. Seeking a range-served <video> by currentTime stalls on
 * every scroll tick; seeking a fully-buffered Blob is immediate. That single
 * difference is what separates a scrub from a slideshow.
 */
(function () {
  var section = document.querySelector('[data-scrub]');
  if (!section) return;

  var video = section.querySelector('.scrub-video');
  if (!video) return;

  // CONTAINER by what the browser can actually decode, SIZE by viewport.
  //
  // Both encodes ship because neither covers everyone: VP9 is smaller and is
  // what Chromium-family browsers take, H.264 is what Safari and iOS need.
  // Picking by canPlayType rather than by user agent means a browser that
  // gains or loses a codec answers for itself.
  var wantMobile = window.matchMedia('(max-width: 860px)').matches;
  var takesWebm = !!video.canPlayType('video/webm; codecs="vp9"');
  var clip = takesWebm
    ? (wantMobile ? video.dataset.webmMobile : video.dataset.webm)
    : (wantMobile ? video.dataset.mp4Mobile : video.dataset.mp4);
  if (!clip) return;

  // Size is picked once, at load, and deliberately NOT re-picked on resize: a
  // desktop window dragged narrow would otherwise re-fetch megabytes and reset
  // the scrub mid-scroll. The 860px break matches the CSS.

  var duration = 0;
  var target = 0;
  var current = 0;
  var frame = 0;
  var painted = false;
  var loading = false;

  function progress() {
    var rect = section.getBoundingClientRect();
    var span = rect.height + window.innerHeight;
    if (span <= 0) return 0;
    var p = (window.innerHeight - rect.top) / span;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  function nearViewport() {
    var rect = section.getBoundingClientRect();
    return rect.top < window.innerHeight * 2 && rect.bottom > -window.innerHeight;
  }

  /* Save-Data and 2g get the poster and nothing else. A still frame of the film
     is the designed fallback, not a degraded one, and it is not worth 800KB of
     somebody's metered plan. */
  function tooExpensive() {
    var c = navigator.connection;
    if (!c) return false;
    return c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g';
  }

  function load() {
    if (loading || tooExpensive()) return;
    loading = true;
    fetch(clip, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('clip ' + r.status);
        return r.blob();
      })
      .then(function (blob) {
        // The markup carries preload="none" so nothing fetches on page load.
        // It has to be lifted HERE or the browser honours it against the blob
        // too: the request is aborted, metadata never arrives, duration stays
        // NaN and the scrub silently degrades to a still. Caught by
        // test-scrub.mjs, which is the only thing that would have.
        video.preload = 'auto';
        video.src = URL.createObjectURL(blob);
        video.load();
      })
      .catch(function () {
        // The poster stays. A missing film costs the motion, never the copy.
        section.dataset.scrubFailed = 'true';
      });
  }

  video.addEventListener('loadedmetadata', function () {
    duration = video.duration || 0;
    tick();
  });

  // Only mark the poster spent once a real frame has actually painted —
  // swapping on loadedmetadata shows a blank box on slow connections.
  video.addEventListener('seeked', function () {
    if (!painted) {
      painted = true;
      section.dataset.scrubPainted = 'true';
    }
  });

  // The first 6.00s of the original clip was a black rectangle - measured at
  // 4fps, the 95th-percentile luminance first clears 40 (of 255) there - and the
  // scrub skipped it with START = 0.40. It was still being DOWNLOADED: 40% of
  // the bytes for frames no visitor ever saw. Cut out of the files on
  // 2026-09-12, so the playhead starts at zero and the whole file is the scroll.
  var START = 0;

  function tick() {
    frame = 0;
    if (!duration) return;
    // Ease toward the target so a flung scroll does not machine-gun seeks.
    current += (target - current) * 0.18;
    if (Math.abs(target - current) < 0.0008) current = target;
    var t = (START + current * (1 - START)) * duration;
    if (video.fastSeek) {
      try { video.fastSeek(t); } catch (e) { video.currentTime = t; }
    } else {
      video.currentTime = t;
    }
    if (current !== target) schedule();
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(tick);
  }

  function onScroll() {
    if (!nearViewport()) return;
    if (!loading) load();
    target = progress();
    schedule();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* THE DOWNLOAD STARTS ON IDLE, NOT AT TWO VIEWPORTS (2026-09-12).
     Rahaid: "some of the pages the black loop is static." Measured, cold, on a
     throttled connection: time from reaching the closing to the first moving
     frame was 1.6s on fast 4G and 8.7s on slow 4G - on EVERY page. The effect
     was built for the home page, which is 10,032px tall, so the two-viewport
     trigger fired thousands of pixels and several seconds before the visitor
     arrived and the fetch always won. The question pages are 3,376-4,582px: the
     closing is a third of the way down the same scroll, so the same fetch has a
     third of the runway and loses. Nothing was broken on those pages - they just
     could not cover the distance, and a film that has not arrived is a black
     band.
     So the clip is fetched while the visitor is reading, which is the time the
     short pages do have. The SEEKING stays gated on nearViewport; only the
     download moved. */
  if (!tooExpensive()) {
    var kick = function () { load(); };
    if (window.requestIdleCallback) requestIdleCallback(kick, { timeout: 2500 });
    else setTimeout(kick, 1200);
  }

  /* The blob was never released. One clip per page, held for the life of the
     page, on seven pages instead of one since the closing was patterned. */
  window.addEventListener('pagehide', function () {
    if (video.src && video.src.indexOf('blob:') === 0) URL.revokeObjectURL(video.src);
  });
})();
