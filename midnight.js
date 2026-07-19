/* ============================================================
   MIDNIGHT EDITORIAL — sitewide behaviour layer (2026-07-18)
   Injects: particle field into .hero, magnetic primary CTAs,
   PECR consent banner + consent-gated Meta pixel (inert until
   META_PIXEL_ID is a real numeric ID from Events Manager).
   No page markup is edited by hand — everything is injected.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Signature silk — GPU shader ribbon with 2D fallback ----------
     Owner rule (2026-07-18): animations always run — device motion settings
     never change the look. WebGL renders per-pixel silk; devices without it
     get the original stroke ribbon. One codepath for every hero, homepage included. */
  function particles() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'mid-particles';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
    hero.insertBefore(canvas, hero.firstChild);

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, raf = 0, running = true, onScreen = true;
    var pointer = { x: 0, tx: 0 }, scrollDrift = 0, t0 = performance.now();

    function wire(resize, draw) {
      if (window.ResizeObserver) {
        new ResizeObserver(function () {
          var r = hero.getBoundingClientRect();
          if (Math.abs(r.width - w) > 1 || Math.abs(r.height - h) > 1) resize();
        }).observe(hero);
      } else if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { resize(); });
      }
      window.addEventListener('resize', function () { cancelAnimationFrame(raf); resize(); draw(); }, { passive: true });
      window.addEventListener('pointermove', function (e) {
        pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      }, { passive: true });
      window.addEventListener('scroll', function () { scrollDrift = window.scrollY * 0.0012; }, { passive: true });
      window.addEventListener('deviceorientation', function (e) {
        if (e.gamma !== null) pointer.tx = Math.max(-1, Math.min(1, e.gamma / 30));
      }, { passive: true });
      window.addEventListener('touchmove', function (e) {
        if (e.touches && e.touches[0]) pointer.tx = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
      }, { passive: true });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { running = false; cancelAnimationFrame(raf); }
        else if (onScreen) { running = true; draw(); }
      });
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (!onScreen) { running = false; cancelAnimationFrame(raf); }
        else if (!document.hidden && !running) { running = true; draw(); }
      }).observe(hero);
    }

    /* ---- WebGL path ---- */
    function tryWebGL() {
      var gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' });
      if (!gl) return false;
      var VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
      var FS =
        'precision mediump float;' +
        'uniform vec2 R;uniform float T;uniform float P;uniform float S;' +
        'float band(vec2 uv,float base,float amp,float fr,float sp,float ph){' +
        '  float env=sin(3.14159*uv.x);' +
        '  float f=base+amp*env*(sin(uv.x*6.2832*fr+T*sp+ph+P*1.6*env)' +
        '        +0.5*sin(uv.x*6.2832*fr*2.7-T*sp*1.3+ph*1.7));' +
        '  float d=abs(uv.y-f);' +
        '  return exp(-d*d*2600.0)*0.85+0.0013/(d+0.0022);}' +
        'void main(){' +
        '  vec2 uv=gl_FragCoord.xy/R;uv.y=1.0-uv.y;' +
        '  float i1=band(uv,0.66,0.17,1.35,0.42,S)' +
        '          +0.6*band(uv,0.69,0.16,1.35,0.42,0.6+S);' +
        '  float i2=band(uv,0.74,0.12,1.9,0.3,2.1+S*2.0);' +
        '  float i3=band(uv,0.58,0.2,0.9,0.54,4.2+S*3.0);' +
        '  vec3 c=i1*vec3(0.545,0.361,0.965)+i2*vec3(0.427,0.247,0.753)+i3*vec3(0.769,0.71,0.992);' +
        '  c*=0.155;' +
        '  float a=clamp((i1+i2+i3)*0.11,0.0,0.85);' +
        '  gl_FragColor=vec4(c,a);}';
      function sh(type, src) {
        var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
        return s;
      }
      var prog;
      try {
        prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
      } catch (e) { return false; }
      gl.useProgram(prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      var uR = gl.getUniformLocation(prog, 'R'), uT = gl.getUniformLocation(prog, 'T'),
          uP = gl.getUniformLocation(prog, 'P'), uS = gl.getUniformLocation(prog, 'S');
      function resize() {
        var r = hero.getBoundingClientRect();
        w = r.width; h = r.height;
        canvas.width = w * dpr; canvas.height = h * dpr;
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      function draw() {
        if (!running) return;
        pointer.x += (pointer.tx - pointer.x) * 0.04;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uR, canvas.width, canvas.height);
        gl.uniform1f(uT, (performance.now() - t0) / 1000);
        gl.uniform1f(uP, pointer.x);
        gl.uniform1f(uS, scrollDrift);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        raf = requestAnimationFrame(draw);
      }
      wire(resize, draw);
      resize(); draw();
      return true;
    }

    /* ---- 2D fallback (the original stroke ribbon) ---- */
    function fall2D() {
      var ctx = canvas.getContext('2d');
      var t = 0;
      var RIBBONS = [
        { strands: 22, baseY: 0.72, amp: 0.16, freq: 1.35, speed: 0.0022, thick: 1.1, hue: [139, 92, 246], alpha: 0.1, core: 0.5 },
        { strands: 16, baseY: 0.78, amp: 0.11, freq: 1.9,  speed: 0.0016, thick: 1.0, hue: [109, 63, 192], alpha: 0.09, core: 0.4 },
        { strands: 12, baseY: 0.66, amp: 0.19, freq: 0.9,  speed: 0.0029, thick: 1.2, hue: [196, 181, 253], alpha: 0.08, core: 0.65 }
      ];
      function resize() {
        var r = hero.getBoundingClientRect();
        w = r.width; h = r.height;
        canvas.width = w * dpr; canvas.height = h * dpr;
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      function draw() {
        if (!running) return;
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        pointer.x += (pointer.tx - pointer.x) * 0.04;
        for (var r = 0; r < RIBBONS.length; r++) {
          var R = RIBBONS[r];
          var phase = t * R.speed + r * 2.1 + scrollDrift * (r + 1);
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
      wire(resize, draw);
      resize(); draw();
    }

    if (!tryWebGL()) fall2D();
  }

  /* ---------- Magnetic primary CTAs (desktop pointers only) ---------- */
  function magnetic() {
    if (!window.matchMedia('(hover:hover)').matches) return;
    document.querySelectorAll('.btn-primary, .btn-solid').forEach(function (btn) {
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

  /* ---------- Scroll reveals — editorial fade-rise with stagger ---------- */
  function reveals() {
    var els = document.querySelectorAll(
      '.svc-row, .why-item, .founder-card, .founders-intro, .services-head, .section-header, ' +
      '.step-row, .price-col, .ind-item, .prob-row, .closing-copy, .closing-grid form, ' +
      '.faq-list details, details.faq-item, .build-card, .why-grid > *, .agent-row, .cmp-row'
    );
    if (!els.length) return;
    var style = document.createElement('style');
    style.textContent = '.mrv{opacity:0;transform:translateY(18px);transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1)}.mrv.mrv-in{opacity:1;transform:none}';
    document.head.appendChild(style);
    els.forEach(function (el) { el.classList.add('mrv'); });
    var io = new IntersectionObserver(function (entries) {
      entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; })
        .forEach(function (e, i) {
          setTimeout(function () { e.target.classList.add('mrv-in'); }, i * 70);
          io.unobserve(e.target);
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (el) { io.observe(el); });
    /* anything already revealed-by-position at load shows immediately */
    setTimeout(function () {
      els.forEach(function (el) {
        if (!el.classList.contains('mrv-in') && el.getBoundingClientRect().top < window.innerHeight * 0.95) {
          el.classList.add('mrv-in');
        }
      });
    }, 900);
  }

  /* ---------- Smooth FAQ opening — details content eases in ---------- */
  function faqEase() {
    document.querySelectorAll('details').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        Array.prototype.slice.call(d.children).forEach(function (child) {
          if (child.tagName === 'SUMMARY') return;
          child.animate(
            [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
            { duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' }
          );
        });
      });
    });
  }

  /* ---------- Self-hiding nav: away on scroll down, back on scroll up ---------- */
  function navHide() {
    var nav = document.querySelector('nav');
    if (!nav) return;
    var last = window.scrollY, acc = 0;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      var menu = document.querySelector('.mobile-menu.open');
      if (menu) { nav.classList.remove('mid-nav-hidden'); last = y; return; }
      var d = y - last; last = y;
      acc = (d > 0) === (acc > 0) ? acc + d : d;
      if (y < 120 || acc < -24) nav.classList.remove('mid-nav-hidden');
      else if (acc > 90 && y > 240) nav.classList.add('mid-nav-hidden');
    }, { passive: true });
  }

  /* ---------- Ghost numerals — the row numbers echoed huge and faint, drifting on scroll ---------- */
  function ghosts() {
    var rows = Array.prototype.filter.call(document.querySelectorAll('.svc-row'), function (r) {
      return r.querySelector('.svc-num');
    });
    if (!rows.length) return;
    var style = document.createElement('style');
    style.textContent =
      '.svc-row { position:relative; }' +
      '.svc-row::before { content:attr(data-ghost) / ""; position:absolute; left:-14px; top:-30px; z-index:0;' +
      ' font-family:Fraunces,Georgia,serif; font-style:italic; font-weight:500; line-height:1;' +
      ' font-size:clamp(120px, 16vw, 230px); color:rgba(139,92,246,0.055); pointer-events:none;' +
      ' transform:translateY(var(--ghost-y, 0px)); will-change:transform; transition:color .5s; }' +
      '.svc-row:hover::before { color:rgba(139,92,246,0.11); }' +
      '.svc-row > * { position:relative; z-index:1; }' +
      '@supports (animation-timeline: view()) {' +
      ' .svc-row { border-top-color:transparent !important; }' +
      ' .svc-row::after { content:""; position:absolute; top:0; left:0; right:0; height:1px;' +
      '  background:rgba(238,232,255,0.1); transform-origin:left; transform:scaleX(0);' +
      '  animation:mid-draw 1ms linear both; animation-timeline:view(); animation-range:entry 0% entry 45%; }' +
      ' @keyframes mid-draw { from { transform:scaleX(0); } to { transform:scaleX(1); } }' +
      '}';
    document.head.appendChild(style);
    rows.forEach(function (r) { r.setAttribute('data-ghost', r.querySelector('.svc-num').textContent.trim()); });
    var ticking = false;
    function drift() {
      rows.forEach(function (r) {
        var rect = r.getBoundingClientRect();
        var off = (rect.top + rect.height / 2 - window.innerHeight / 2) * 0.07;
        r.style.setProperty('--ghost-y', off.toFixed(1) + 'px');
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(drift); }
    }, { passive: true });
    drift();
  }

  /* ---------- 3D tilt on gallery/build cards (desktop pointers) ---------- */
  function tilt() {
    if (!window.matchMedia('(hover:hover)').matches) return;
    document.querySelectorAll('.build-card').forEach(function (card) {
      card.style.transition = 'transform .25s cubic-bezier(.16,1,.3,1)';
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var rx = ((e.clientY - r.top) / r.height - 0.5) * -6;
        var ry = ((e.clientX - r.left) / r.width - 0.5) * 8;
        card.style.transform = 'perspective(800px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  function init() { particles(); magnetic(); consent(); reveals(); faqEase(); navHide(); ghosts(); tilt(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
