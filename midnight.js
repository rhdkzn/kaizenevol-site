/* ============================================================
   MIDNIGHT EDITORIAL — sitewide behaviour layer (2026-07-18)
   Injects: particle field into .hero, magnetic primary CTAs,
   scroll reveals, nav behaviour and heading masks.
   Cookie consent and the Meta pixel are NOT here — they live in
   /script.js, which is the only consent gate on this site.
   No page markup is edited by hand — everything is injected.
   ============================================================ */
(function () {
  'use strict';

  /* Spring easing — computed damped-spring curve (Framer-grade settle). Used on scroll reveals. */
  var MID_SPRING = 'linear(0 0%,0.055 4%,0.189 8%,0.363 12%,0.547 17%,0.718 21%,0.863 25%,0.975 29%,1.053 33%,1.101 38%,1.123 42%,1.125 46%,1.114 50%,1.095 54%,1.072 58%,1.049 62%,1.028 67%,1.012 71%,0.999 75%,0.991 79%,0.986 83%,0.984 88%,0.985 92%,0.986 96%,0.989 100%)';

  /* ---------- Web-craft layer (Forge 2026-07-20): a11y + typography + prefetch ----------
     Injected sitewide via this runtime (loads on every marketing page). */
  function craft() {
    var s = document.createElement('style');
    s.textContent =
      'html{scroll-padding-top:84px;}' +               /* WCAG 2.2 SC 2.4.11: sticky nav no longer hides the focus ring */
      'h1,h2,h3{text-wrap:balance;}' +                 /* even headline line-breaks, no orphan word */
      'p,li{text-wrap:pretty;}' +                      /* body orphan fix */
      /* WCAG 2.2 SC 2.5.8: 24px grab area WITHOUT fattening the 2px track — pad the hit
         box and clip the fill to the thin content strip so the slider stays elegant. */
      'input[type=range]{min-block-size:24px;padding-block:11px;background-clip:content-box!important;box-sizing:border-box;}' +
      '.fc-row{min-block-size:24px;}';                 /* contact-row action links to a 24px hit area */
    document.head.appendChild(s);
    /* Speculation Rules: prefetch same-origin links on intent -> near-instant navigation.
       Prefetch only (not prerender) so no page JS/pixel pre-fires; consent-gating untouched. */
    if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
      var sr = document.createElement('script');
      sr.type = 'speculationrules';
      sr.textContent = '{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}';
      document.head.appendChild(sr);
    }
  }

  /* ---------- Filmic grain + vignette — the 'expensive' texture ----------
     A static SVG fractal-noise overlay at low opacity (soft-light blend) plus a
     gentle radial vignette. Pure texture: pointer-events:none so it never
     intercepts input, no animation (reads on large dark fields, invisible over
     UI chrome). Sitewide via the loaded layer. */
  function grain() {
    var svg = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">' +
      '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>' +
      '<feColorMatrix type="saturate" values="0"/></filter>' +
      '<rect width="100%" height="100%" filter="url(#n)"/></svg>');
    var st = document.createElement('style');
    st.textContent =
      '.mid-grain,.mid-vignette{position:fixed;inset:0;pointer-events:none;}' +
      '.mid-vignette{z-index:9989;background:radial-gradient(125% 125% at 50% 40%,transparent 62%,rgba(35,33,30,0.045) 100%);}' +
      '.mid-grain{z-index:9990;opacity:0.06;' +
        'background-image:url("' + svg + '");background-size:170px 170px;}';
    document.head.appendChild(st);
    var v = document.createElement('div'); v.className = 'mid-vignette'; v.setAttribute('aria-hidden', 'true');
    var g = document.createElement('div'); g.className = 'mid-grain'; g.setAttribute('aria-hidden', 'true');
    document.body.appendChild(v); document.body.appendChild(g);
  }

  /* ---------- Count-up — the big revenue figures tick from zero on first view ----------
     Targets the shared .calc-result-amount cells. Reads the target at the moment the
     element scrolls in (so it respects any slider changes already made), animates 0 -> target
     once (easeOutCubic), preserving the £ prefix and en-GB grouping. Any slider 'input'
     cancels a running count so it never fights the live calculator. */
  function countUp() {
    var els = [].slice.call(document.querySelectorAll('.calc-result-amount, [data-countup]'));
    if (!els.length) return;
    var active = [];
    document.addEventListener('input', function () { active.forEach(function (t) { t.cancelled = true; }); active = []; }, { passive: true });
    function fmt(c, n) { return c.prefix + Math.round(n).toLocaleString('en-GB') + c.suffix; }
    function animate(el) {
      var c = el._cu; if (!c || !(c.target > 0)) return;
      var dur = 1100, start = null, tok = { cancelled: false };
      active.push(tok);
      function step(ts) {
        if (tok.cancelled) return;
        if (start === null) start = ts;
        var p = Math.min((ts - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(c, c.target * e);
        if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(c, c.target);
      }
      requestAnimationFrame(step);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target; io.unobserve(el); animate(el);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) {
      var raw = el.textContent, m = raw.match(/-?\d[\d,]*\.?\d*/);
      if (!m) return;
      var target = parseFloat(m[0].replace(/,/g, ''));
      if (!isFinite(target) || target === 0) return;         // leave zero/blank cells untouched
      el._cu = { prefix: raw.slice(0, m.index), suffix: raw.slice(m.index + m[0].length), target: target };
      el.textContent = fmt(el._cu, 0);                        // pin to zero up front so the final value never flashes
      io.observe(el);
    });
  }

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

    // Cap DPR to 1 on phones: at 2x a 390px viewport renders ~1.14M px/frame
    // through four band() calls each running exp() + two sin(). Visually
    // indistinguishable at that size, quarter the fragment work.
    var dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1 : 2);
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
      /* Software GL (SwiftShader/llvmpipe) means no real GPU — the per-pixel
         shader would burn the CPU. Use the cheap stroke ribbon instead. */
      try {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        var renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
        if (/swiftshader|llvmpipe|software/i.test(renderer)) return false;
      } catch (e) {}
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
        /* These bases and amps ARE the aura's position on a phone - the WebGL path, not the 2D
           ribbons below, which is what an earlier fix moved by mistake. 0.58-0.86 of the hero
           ran through the paragraph (Rahaid's screenshot, 03:21, 2026-09-05). Now 0.76-0.96:
           behind the buttons and the seat line, under the copy. The paragraph ends at ~63%. */
        '  float i1=band(uv,0.86,0.06,1.35,0.42,S)' +
        '          +0.6*band(uv,0.88,0.06,1.35,0.42,0.6+S);' +
        '  float i2=band(uv,0.90,0.05,1.9,0.3,2.1+S*2.0);' +
        '  float i3=band(uv,0.82,0.07,0.9,0.54,4.2+S*3.0);' +
        /* Neutral graphite, weighted by band intensity. Three greys with a faint warm-to-cool
           drift (ink -> stone -> cool) so the ribbon still reads as depth without carrying a hue.
           Colour is NOT premultiplied: the blend below is standard source-alpha, so the silk
           DARKENS the off-white ground instead of trying to add light to it. */
        '  float sum=i1+i2+i3;' +
        '  vec3 c=(i1*vec3(0.137,0.129,0.118)+i2*vec3(0.431,0.416,0.388)+i3*vec3(0.612,0.616,0.624))/max(sum,0.0001);' +
        '  float a=clamp(sum*0.05,0.0,0.14);' +
        /* A WebGL canvas is premultiplied by default, so the shader has to hand back
           premultiplied colour. Emitting straight colour here is what made the first
           neutral pass render LIGHTER than the page instead of darker. */
        '  gl_FragColor=vec4(c*a,a);}';
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
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   /* premultiplied, per the shader above */
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
      if (!ctx) return; /* canvas already holds a WebGL context (software-GL path) — nothing to draw on; skip silently */
      var t = 0;
      var RIBBONS = [
        /* Kept in step with the shader above: the band lives at 0.76-0.96 of the hero, behind
           the buttons and the seat line, never across the copy (2026-09-05). Phones run the
           WebGL path; this fallback only draws where WebGL is unavailable. */
        { strands: 22, baseY: 0.87, amp: 0.06, freq: 1.35, speed: 0.0022, thick: 1.1, hue: [35, 33, 30],    alpha: 0.055, core: 0.17 },
        { strands: 16, baseY: 0.90, amp: 0.05, freq: 1.9,  speed: 0.0016, thick: 1.0, hue: [110, 106, 99],  alpha: 0.050, core: 0.15 },
        { strands: 12, baseY: 0.83, amp: 0.07, freq: 0.9,  speed: 0.0029, thick: 1.2, hue: [156, 158, 160], alpha: 0.060, core: 0.16 }
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
        ctx.globalCompositeOperation = 'source-over';
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

  /* ---------- Consent banner: REMOVED 2026-08-01 ----------
     A second, independent consent implementation lived here from 2026-07-18. It was
     replaced by /script.js, which is the single gate now. Deleted rather than left
     dormant because two gates is not redundancy, it is a hazard:
       - different storage keys ('ke-consent' here vs 'ke_consent' there), so neither
         could see the other's answer and a returning visitor got asked twice;
       - this one rendered its banner even while its pixel loader was inert, so visitors
         were being asked about a Meta cookie that did not exist while privacy.html told
         them the site set no tracking cookies. Both statements were wrong;
       - its own comment invited the next person to set a real pixel ID, at which point
         Decline over there plus Accept here would have loaded the pixel anyway — a PECR
         Reg 6 breach wearing a consent banner;
       - its Decline was 60%-opacity text on transparent against a solid Accept, which is
         the visual imbalance the ICO's dark-pattern position actually bites on.
     Found by a Mike Ross pre-launch review, 2026-08-01. Do not reintroduce a consent
     mechanism here — /script.js owns it. ---------- */

  /* ---------- Heading mask reveal — section H2s wipe up from a mask on scroll-in ----------
     Deliberately NOT the hero H1 (that's the LCP element — animating it in reads as slow).
     A clip-path rise on the heading text; composes with the container fade already running.
     Negative bottom/right insets in the end state keep italic descenders and the accent
     rule from being clipped. */
  function headingReveal() {
    var els = [].slice.call(document.querySelectorAll(
      '.section-head h2, .sec-head h2, .section-header h2, .sect-head h2, ' +
      '.services-head h2, .founders-intro h2, .closing h2, .why h2'));
    if (!els.length) return;
    var st = document.createElement('style');
    st.textContent =
      '.mh{clip-path:inset(-6% -10% 110% 0);transform:translateY(16px);' +
      'transition:clip-path .9s ' + MID_SPRING + ',transform .9s ' + MID_SPRING + '}' +
      '.mh.mh-in{clip-path:inset(-6% -10% -14% 0);transform:none}';
    document.head.appendChild(st);
    els.forEach(function (el) { el.classList.add('mh'); });
    function reveal(el) { el.classList.add('mh-in'); }
    /* Safety net: a heading must NEVER stay hidden. Sweep reveals any heading whose top
       has entered the viewport; runs on scroll (rAF-throttled) and a few timed passes, so
       even if the observer misses one it still shows. */
    function sweep() {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        if (el.classList.contains('mh-in')) return;
        var r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) reveal(el);   // any pixel in the viewport => reveal (never leave one hidden)
      });
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } });
      }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
      els.forEach(function (el) { io.observe(el); });
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { sweep(); ticking = false; });
    }, { passive: true });
    sweep(); setTimeout(sweep, 400); setTimeout(sweep, 1200);
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
    style.textContent = '.mrv{opacity:0;transform:translateY(20px);transition:opacity .5s ease,transform .8s ' + MID_SPRING + '}.mrv.mrv-in{opacity:1;transform:none}';
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
      ' font-size:clamp(120px, 16vw, 230px); color:rgba(35,33,30,0.055); pointer-events:none;' +
      ' transform:translateY(var(--ghost-y, 0px)); will-change:transform; transition:color .5s; }' +
      '.svc-row:hover::before { color:rgba(35,33,30,0.10); }' +
      '.svc-row > * { position:relative; z-index:1; }' +
      '@supports (animation-timeline: view()) {' +
      ' .svc-row { border-top-color:transparent !important; }' +
      ' .svc-row::after { content:""; position:absolute; top:0; left:0; right:0; height:1px;' +
      '  background:rgba(35,33,30,0.14); transform-origin:left; transform:scaleX(0);' +
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

  /* Resilient init: run each module independently so one failure (e.g. a canvas/WebGL
     quirk in particles()) can never abort the rest — reveals, consent, nav must still run. */
  function init() {
    [craft, grain, particles, magnetic, reveals, faqEase, navHide, ghosts, tilt, countUp, headingReveal].forEach(function (fn) {
      try { fn(); } catch (e) { if (window.console) console.warn('midnight: ' + (fn.name || 'module') + ' skipped —', e && e.message); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
