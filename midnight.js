/* ============================================================
   MIDNIGHT EDITORIAL — sitewide behaviour layer (2026-07-18)
   Injects: particle field into .hero, magnetic primary CTAs,
   PECR consent banner + consent-gated Meta pixel (inert until
   META_PIXEL_ID is a real numeric ID from Events Manager).
   No page markup is edited by hand — everything is injected.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Particle field in the hero (bespoke, no libraries) ---------- */
  /* ---------- Signature ribbon in the hero (Midnight II, replaces the constellation) ---------- */
  function particles() {
    /* Owner rule (2026-07-18): animations always run — device motion
       settings do not change the look of the site. */
    if (document.getElementById('ribbon')) return; /* page draws its own (homepage) */
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'mid-particles';
    canvas.setAttribute('aria-hidden', 'true');
    hero.insertBefore(canvas, hero.firstChild);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, t = 0, raf = 0, running = true;
    var pointer = { x: 0, tx: 0 };
    var RIBBONS = [
      { strands: 22, baseY: 0.72, amp: 0.16, freq: 1.35, speed: 0.0022, thick: 1.1, hue: [139, 92, 246], alpha: 0.1, core: 0.5 },
      { strands: 16, baseY: 0.78, amp: 0.11, freq: 1.9,  speed: 0.0016, thick: 1.0, hue: [109, 63, 192], alpha: 0.09, core: 0.4 },
      { strands: 12, baseY: 0.66, amp: 0.19, freq: 0.9,  speed: 0.0029, thick: 1.2, hue: [196, 181, 253], alpha: 0.08, core: 0.65 }
    ];
    function resize() {
      var r = hero.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      for (var r = 0; r < RIBBONS.length; r++) {
        var R = RIBBONS[r];
        var phase = t * R.speed + r * 2.1;
        for (var sIdx = 0; sIdx < R.strands; sIdx++) {
          var off = (sIdx / R.strands - 0.5);
          var isCore = sIdx === Math.floor(R.strands / 2);
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(' + R.hue[0] + ',' + R.hue[1] + ',' + R.hue[2] + ',' + (isCore ? R.core : R.alpha) + ')';
          ctx.lineWidth = isCore ? 1.7 : R.thick;
          var steps = 80;
          for (var i = 0; i <= steps; i++) {
            var x = (i / steps) * (w + 200) - 100;
            var u = i / steps;
            var envelope = Math.sin(u * Math.PI);
            var fold = Math.sin(u * Math.PI * R.freq + phase + off * 2.4)
                     + 0.5 * Math.sin(u * Math.PI * R.freq * 2.7 - phase * 1.3 + off);
            var y = h * R.baseY
                  + fold * h * R.amp * envelope
                  + off * 50 * envelope
                  + pointer.x * 16 * envelope * (r + 1) / 3;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      t++;
      raf = requestAnimationFrame(draw);
    }
    window.addEventListener('resize', function () { cancelAnimationFrame(raf); resize(); draw(); }, { passive: true });
    window.addEventListener('pointermove', function (e) {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else { running = true; draw(); }
    });
    resize(); draw();
  }

  /* ---------- Magnetic primary CTAs (desktop pointers only) ---------- */
  function magnetic() {
    if (!window.matchMedia('(hover:hover)').matches) return;
    document.querySelectorAll('.btn-primary').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.18;
        var y = (e.clientY - r.top - r.height / 2) * 0.28;
        btn.style.transform = 'translate(' + x + 'px,' + (y - 2) + 'px)';
      });
      btn.addEventListener('pointerleave', function () { btn.style.transform = ''; });
    });
  }

  /* ---------- Consent banner + consent-gated Meta pixel ----------
     PECR: nothing loads before explicit Accept. While META_PIXEL_ID
     is the placeholder the loader stays inert even on Accept, so the
     banner + stored choice ship ahead of the pixel itself. */
  var META_PIXEL_ID = 'META_PIXEL_ID'; /* deploy: set real ID from Events Manager */
  var KEY = 'ke-consent';
  function loadPixel() {
    if (!/^[0-9]{10,20}$/.test(META_PIXEL_ID)) return; /* inert until a real ID is set */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', META_PIXEL_ID); fbq('track', 'PageView');
  }
  function consent() {
    var choice = null;
    try { choice = localStorage.getItem(KEY); } catch (e) {}
    if (choice === 'accepted') { loadPixel(); return; }
    if (choice === 'declined') return;
    var wrap = document.createElement('div');
    wrap.className = 'mid-consent';
    wrap.innerHTML =
      '<div class="mid-consent-inner">' +
      '<p><strong>Cookies, briefly:</strong> we’d like to use one Meta advertising cookie to understand which of our ads brought you here. No consent, no cookie — the site works fully either way.</p>' +
      '<div class="mid-consent-btns">' +
      '<button type="button" class="mid-consent-accept">Accept</button>' +
      '<button type="button" class="mid-consent-decline">No thanks</button>' +
      '<a href="/privacy.html">Privacy</a>' +
      '</div></div>';
    document.body.appendChild(wrap);
    wrap.classList.add('show');
    wrap.querySelector('.mid-consent-accept').addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'accepted'); } catch (e) {}
      wrap.classList.remove('show'); loadPixel();
    });
    wrap.querySelector('.mid-consent-decline').addEventListener('click', function () {
      try { localStorage.setItem(KEY, 'declined'); } catch (e) {}
      wrap.classList.remove('show');
    });
  }

  function init() { particles(); magnetic(); consent(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
