/* The ambient contour field — a page background for about / contact / privacy.
 *
 * Deliberately NOT on the homepage: that hero already carries the silk aura, and
 * two ambient layers behind the same headline fight each other (Rahaid, 2026-09-04:
 * "not the hero page because it has the aura").
 *
 * Self-contained on purpose. It injects its own canvas and style so a page opts in
 * with one script tag and nothing else, and there is one place to tune it.
 *
 * z-index:-1 is doing real work: a negative-z child paints ABOVE the propagated body
 * background and BELOW in-flow content, so the field sits behind the text without a
 * single change to any existing element's position or stacking.
 */
(function () {
  if (!document.body) return;
  var cv = document.createElement('canvas');
  cv.id = 'field';
  cv.setAttribute('aria-hidden', 'true');
  var st = document.createElement('style');
  st.textContent = '#field{position:fixed;inset:0;width:100%;height:100%;' +
                   'pointer-events:none;z-index:-1}';
  document.head.appendChild(st);
  document.body.insertBefore(cv, document.body.firstChild);

  var cx = cv.getContext && cv.getContext('2d');
  if (!cx) return;

  /* Calm slows the field rather than stopping it — canon's rule is that reduced
     motion may soften a beat, never switch it off. */
  var calm  = window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      SPEED = calm ? 0.00085 : 0.0030,
      LEAN  = calm ? 0.4 : 1,
      LINES = 32,
      dpr = Math.min(window.devicePixelRatio || 1, 2),
      ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 },
      W = 0, H = 0, t = 0;

  function size() {
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener('resize', size);
  window.addEventListener('pointermove', function (e) {
    ptr.tx = e.clientX / window.innerWidth;
    ptr.ty = e.clientY / window.innerHeight;
  }, { passive: true });

  (function draw() {
    t += SPEED;
    ptr.x += (ptr.tx - ptr.x) * 0.045;
    ptr.y += (ptr.ty - ptr.y) * 0.045;
    cx.clearRect(0, 0, W, H);
    cx.lineWidth = 1.05;
    var lean = (ptr.x - 0.5) * LEAN, rise = (ptr.y - 0.5) * LEAN;
    for (var i = 0; i < LINES; i++) {
      var p = i / (LINES - 1),
          base = H * (0.10 + p * 0.84),
          a = 30 + 56 * Math.sin(p * Math.PI),
          fade = 0.055 + 0.105 * Math.sin(p * Math.PI);
      cx.strokeStyle = 'rgba(138,133,124,' + fade.toFixed(3) + ')';
      cx.beginPath();
      for (var x = -20; x <= W + 20; x += 9) {
        var u = x / (W || 1),
            y = base
              + Math.sin(u * 3.1 + t * 1.7 + p * 2.4) * a
              + Math.sin(u * 7.3 - t * 1.1 + p * 5.1) * a * 0.28
              + lean * 118 * (0.35 + p) * Math.sin(u * 2.0 + p)
              + rise * 44 * (p - 0.5);
        x === -20 ? cx.moveTo(x, y) : cx.lineTo(x, y);
      }
      cx.stroke();
    }
    requestAnimationFrame(draw);
  })();
})();
