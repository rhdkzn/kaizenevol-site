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
  function particles() {
    /* Reduce Motion: draw the constellation once, static — never skip it */
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'mid-particles';
    canvas.setAttribute('aria-hidden', 'true');
    hero.insertBefore(canvas, hero.firstChild);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, ps = [], running = true, raf = 0;
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var ACCENT = '139,92,246';
    function count() {
      var base = Math.round((w * h) / 12000);
      return Math.max(30, Math.min(window.innerWidth < 640 ? 46 : 80, base));
    }
    function resize() {
      var r = hero.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }
    function build() {
      ps = [];
      for (var i = 0, n = count(); i < n; i++) {
        ps.push({ x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
          r: Math.random() * 1.8 + 0.7, d: Math.random() * 0.6 + 0.4 });
      }
    }
    function step() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      var i, j, p, q, dx, dy, dist;
      for (i = 0; i < ps.length; i++) {
        p = ps[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
      }
      for (i = 0; i < ps.length; i++) {
        p = ps[i];
        var px = p.x + pointer.x * p.d, py = p.y + pointer.y * p.d;
        for (j = i + 1; j < ps.length; j++) {
          q = ps[j];
          var qx = q.x + pointer.x * q.d, qy = q.y + pointer.y * q.d;
          dx = px - qx; dy = py - qy; dist = dx * dx + dy * dy;
          if (dist < 16500) {
            ctx.strokeStyle = 'rgba(' + ACCENT + ',' + ((1 - dist / 16500) * 0.6) + ')';
            ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(' + ACCENT + ',1)';
        ctx.beginPath(); ctx.arc(px, py, p.r + 0.4, 0, 6.283); ctx.fill();
      }
      if (reduced) { running = false; return; } /* static single frame */
      raf = requestAnimationFrame(step);
    }
    window.addEventListener('resize', function () { cancelAnimationFrame(raf); resize(); running = true; step(); }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; step(); }
    });
    window.addEventListener('pointermove', function (e) {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 40;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 40;
    }, { passive: true });
    resize(); step();
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
