/* Attribution capture — which ad produced which lead.
 *
 * Written 2026-09-05. We run paid ads and our own lead forms could not tell us
 * which campaign a lead came from: index/apply/contact carried no utm_source,
 * no gclid, no fbclid, nothing. CRITICAL_FACTS sells the Foundation site on
 * "owning the backend is how we can PROVE attribution instead of arguing about
 * it", and our own backend was not capturing the parameters that prove it.
 *
 * NOTHING IS STORED ON THE VISITOR'S DEVICE, AND THAT IS DELIBERATE.
 * The obvious implementation is to stash the parameters in localStorage on
 * landing so they survive navigation. Under UK PECR, writing to a visitor's
 * terminal equipment needs consent unless it is strictly necessary for the
 * service they asked for — and attribution is for us, not for them. We have no
 * cookie banner. Rahaid's stated hard line is criminal exposure and finable
 * offences, so this takes the route that raises no consent question at all:
 *
 *   1. read the parameters out of the URL,
 *   2. append them to same-origin links so they survive index -> apply,
 *   3. read them again at submit and send them with the form.
 *
 * The trade-off is honest: a visitor who opens a new tab, or returns tomorrow
 * from a bookmark, arrives without parameters and that lead is unattributed.
 * A stored first-touch would catch those. That upgrade needs a consent
 * mechanism first — a Mike Ross question, not a code one.
 */
(function () {
  'use strict'
  var KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content',
              'gclid','fbclid','ttclid','msclkid']
  var found = {}

  try {
    var params = new URLSearchParams(location.search)
    KEYS.forEach(function (k) {
      var v = params.get(k)
      if (v) found[k] = String(v).slice(0, 200)   /* cap: these land in a lead record */
    })
  } catch (e) { /* no URLSearchParams: degrade to no attribution, never throw */ }

  var present = Object.keys(found)

  /* Carry the parameters across our own pages. An ad lands on the homepage and
   * the visitor clicks through to apply.html; without this the parameters die
   * at the first click, which is the common case, not the edge case. */
  function decorate () {
    if (!present.length) return
    var qs = present.map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(found[k])
    }).join('&')
    var links = document.querySelectorAll('a[href]')
    for (var i = 0; i < links.length; i++) {
      var a = links[i]
      var href = a.getAttribute('href')
      if (!href) continue
      if (/^(mailto:|tel:|javascript:|#|data:)/i.test(href)) continue
      /* Absolute URLs are only ours if the host matches. a.hostname is resolved
         by the browser, so relative hrefs report our own host and pass. */
      if (a.hostname && a.hostname !== location.hostname) continue
      if (href.indexOf('utm_') > -1 || href.indexOf('gclid=') > -1) continue  /* already carried */
      a.setAttribute('href', href + (href.indexOf('?') > -1 ? '&' : '?') + qs)
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate)
  else decorate()

  /* Read at submit time. Returns null when there is nothing to say, so a lead
   * record never carries an empty attribution object pretending to be data. */
  window.keAttribution = function () {
    var out = {}
    for (var k in found) if (Object.prototype.hasOwnProperty.call(found, k)) out[k] = found[k]
    out.landing = location.pathname
    if (document.referrer && document.referrer.indexOf(location.origin) !== 0) {
      out.referrer = String(document.referrer).slice(0, 300)
    }
    /* landing alone is not attribution — it tells us nothing we did not know. */
    return present.length || out.referrer ? out : null
  }
})()
