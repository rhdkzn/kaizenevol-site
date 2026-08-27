/* KaizenEvol — consent gate + Meta pixel.
 *
 * Created 2026-07-31 and referenced from every public page (not crm.html or
 * dashboard.html — internal tools get no pixel and no banner).
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: the pixel does not load until the visitor
 * has said yes. A banner that drops the cookie and then asks is the violation PLUS the
 * appearance of compliance, which is worse than having no banner at all.
 *
 * Under UK PECR a tracking pixel is a non-essential cookie and needs prior consent.
 * The ICO is also explicit that refusing must be as easy as accepting — so "Decline" is
 * a real button of equal weight here, never a buried link. The site's own analytics
 * (Vercel) stays cookieless and is unaffected either way.
 *
 * Not legal advice. This is a good-faith implementation and Mike Ross should read it
 * before we rely on it commercially.
 *
 * TO ACTIVATE: put the Meta pixel ID in PIXEL_ID below. Until then this file does
 * nothing at all — no banner, no cookie, no network call. A cookie banner for a pixel
 * that does not exist would be asking permission for nothing.
 */
(function () {
  'use strict';

  var PIXEL_ID = '';                       // <-- Meta Events Manager -> Data Sources -> your pixel
  var STORE_KEY = 'ke_consent';            // 'granted' | 'denied'
  var POLICY_URL = '/privacy';

  if (!PIXEL_ID) return;                   // fail silent and harmless, never half-configured

  function read() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* private mode: session-only */ }
  }

  var loaded = false;

  function loadPixel() {
    if (loaded) return;
    loaded = true;
    /* Meta's standard loader. Only ever reached after an explicit yes. */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  /* Called by the lead forms on success. No-ops without consent rather than queueing —
     a "Lead" fired for someone who declined is exactly what they declined. */
  window.keTrackLead = function (params) {
    if (read() !== 'granted' || !window.fbq) return;
    window.fbq('track', 'Lead', params || {});
  };

  /* Withdrawal (UK GDPR Art 7(3): withdrawing must be as easy as giving).
     Clears the stored answer, drops Meta's first-party _fbp cookie, and re-asks.
     Meta's own third-party cookies are not ours to delete — the privacy notice says
     so and points people at their Facebook/Instagram ad settings for those. An
     already-running pixel is not unloaded mid-session; it simply never starts again. */
  function forget() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    document.cookie = '_fbp=; Max-Age=0; path=/';
    document.cookie = '_fbp=; Max-Age=0; path=/; domain=.' + location.hostname.replace(/^www\./, '');
  }

  window.keCookieChoices = function () {
    forget();
    if (!document.querySelector('.ke-consent')) banner();
  };

  /* The footer link. Injected rather than hand-added to nineteen footers, and only
     when a pixel is configured — with no pixel there is no consent to withdraw. */
  function footerLink() {
    var host = document.querySelector('footer ul') || document.querySelector('footer');
    if (!host) return;
    var a = document.createElement('a');
    a.href = '#'; a.textContent = 'Cookie choices';
    a.addEventListener('click', function (e) { e.preventDefault(); window.keCookieChoices(); });
    if (host.tagName === 'UL') { var li = document.createElement('li'); li.appendChild(a); host.appendChild(li); }
    else { a.style.marginLeft = '12px'; host.appendChild(a); }
  }

  function dismiss(el) {
    el.removeAttribute('data-open');
    setTimeout(function () { el.remove(); }, 260);
  }

  function banner() {
    var el = document.createElement('div');
    el.className = 'ke-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Cookie choice');
    el.innerHTML =
      '<p>We\'d like to use cookies to measure our advertising. Nothing else, and only if ' +
      'you say yes. <a href="' + POLICY_URL + '">How we handle your data</a>.</p>' +
      '<div class="ke-consent-btns">' +
      '<button type="button" data-ke="no">Decline</button>' +
      '<button type="button" data-ke="yes">Accept</button>' +
      '</div>';

    var css = document.createElement('style');
    css.textContent =
      '.ke-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:640px;' +
      'margin:0 auto;display:flex;flex-wrap:wrap;gap:14px 20px;align-items:center;' +
      'justify-content:space-between;padding:16px 18px;border-radius:14px;' +
      'background:rgba(18,10,36,.97);border:1px solid rgba(167,139,250,.28);color:#EEE8FF;' +
      'font:400 14px/1.55 "Plus Jakarta Sans",system-ui,sans-serif;' +
      'box-shadow:0 24px 60px -24px rgba(0,0,0,.75);opacity:0;transform:translateY(12px);' +
      'transition:opacity .24s ease,transform .24s ease}' +
      '.ke-consent[data-open]{opacity:1;transform:translateY(0)}' +
      '.ke-consent p{margin:0;flex:1 1 260px;color:rgba(238,232,255,.82)}' +
      '.ke-consent a{color:#A78BFA}' +
      '.ke-consent-btns{display:flex;gap:10px;flex:0 0 auto}' +
      /* Equal weight on both, deliberately: the ICO expects refusing to be as easy as
         accepting, and a ghosted "Decline" next to a solid "Accept" is not that. */
      '.ke-consent button{font:600 14px/1 inherit;padding:11px 18px;border-radius:999px;' +
      'cursor:pointer;border:1px solid rgba(167,139,250,.45);background:transparent;color:#EEE8FF}' +
      '.ke-consent button[data-ke="yes"]{background:#8B5CF6;border-color:#8B5CF6;color:#fff}' +
      '.ke-consent button:focus-visible{outline:2px solid #A78BFA;outline-offset:3px}' +
      ''  /* no reduce-motion override — see test-reduced-motion.mjs */;

    document.head.appendChild(css);
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.setAttribute('data-open', ''); });

    el.addEventListener('click', function (ev) {
      var choice = ev.target.getAttribute && ev.target.getAttribute('data-ke');
      if (!choice) return;
      if (choice === 'yes') { write('granted'); loadPixel(); }
      else { write('denied'); }
      dismiss(el);
    });
  }

  function start() {
    footerLink();
    var state = read();
    if (state === 'granted') { loadPixel(); return; }
    if (state === 'denied') return;
    banner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
