/* Page transitions — the half the browser cannot do on its own.
 *
 * A cross-document view transition (interactions.css) can only START once the next page
 * has been fetched and is ready to render. On a phone that is hundreds of milliseconds
 * after the tap, and for all of it the old page just sits there. Then the content swaps.
 * The swap can be perfect and the whole thing still reads as "nothing happened, then the
 * page changed" — which is what six tuned versions of the swap were all being judged on.
 *
 * So the exit starts HERE, on the tap, before any network: the content leaves at once,
 * the frame stays, and the fetch happens behind an empty stage instead of a frozen one.
 * When the new document renders, the view transition brings its content in. In a browser
 * without cross-document view transitions this still gives a real animated exit and then
 * the new page, rather than nothing at all.
 */
(function () {
  'use strict';
  /* The full length of the exit, on purpose. The browser captures the old page for the
     view transition at the moment navigation commits and then HOLDS that capture, frozen,
     while the new document loads. Navigate before the exit has finished and the capture
     is a half-faded ghost of the content, frozen mid-fade for as long as the fetch takes
     (recorded: ~25% ghost held ~200ms on a local server after a 100ms hold). Navigate
     after it and the hold is an empty stage with the frame intact, which is the design. */
  var EXIT_MS = 170;
  var main = document.querySelector('main');
  if (!main) return;

  function samePage(a) {
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    var url;
    try { url = new URL(a.href, location.href); } catch (e) { return false; }
    if (url.origin !== location.origin) return false;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    // Same document, different fragment: let the browser scroll.
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
    return true;
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a');
    if (!a || !samePage(a)) return;
    e.preventDefault();
    var href = a.href;

    // Close the menu immediately so its snapshot is not a half-open drawer.
    var menu = document.querySelector('.mobile-menu.open');
    if (menu) {
      menu.classList.remove('open');
      var burger = document.querySelector('.burger[aria-expanded="true"]');
      if (burger) burger.setAttribute('aria-expanded', 'false');
    }
    document.documentElement.classList.add('leaving');
    setTimeout(function () { location.assign(href); }, EXIT_MS);
  });

  // Coming back from the bfcache restores the page exactly as it was left — mid-exit.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) document.documentElement.classList.remove('leaving');
  });
})();
