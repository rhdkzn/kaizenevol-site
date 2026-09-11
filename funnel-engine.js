/* funnel-engine.js — one renderer, many funnels.
 *
 * apply.html proved the mechanic: one question per screen, the answer IS the navigation,
 * capture last, then a read-back that says something true. This makes that mechanic DATA.
 * A new funnel is a JSON file in /funnels, not a new page — which is the difference between
 * "we can build a funnel" and "we ship a client funnel in an hour" (RES-CMP-013).
 *
 * Deliberately NOT a framework. No build step, no dependencies, ES5 so it matches the rest
 * of the estate, and every capability here exists because a real funnel needed it.
 *
 * Values are written with textContent, so an option's stored value is the literal string in
 * the JSON. That removes a whole class of bug the hand-built page had: the markup used HTML
 * entities, the values were read back with textContent, and one wrong en dash would have made
 * downstream logic silently miss with nothing erroring.
 */
(function (global) {
  'use strict';

  /* ── Read-backs ──────────────────────────────────────────────────────────────
     The maths is LOGIC, not content, so it lives here and a spec names one. A funnel
     with no reveal simply does not show the block.
     Rule, from the diagnosis-funnel skill: it PROVES, it never SOLVES. */
  var REVEALS = {};

  REVEALS['ecom-margin'] = (function () {
    var REV  = { 'Pre-launch, nothing yet': 0, 'Under £5k': 3000, '£5k – £15k': 10000, '£15k – £40k': 27000, '£40k – £100k': 70000, 'Over £100k': 130000 };
    var COGS = { 'About a quarter': 0.25, 'About a third': 0.33, 'About half': 0.5, 'More than half': 0.6 };
    var ADS  = { 'Nothing yet': 0, 'Under £1k': 500, '£1k – £5k': 3000, '£5k – £15k': 10000, 'Over £15k': 20000 };

    function money(n) { return n >= 1000 ? '£' + Math.round(n / 1000) + 'k' : '£' + Math.round(n / 100) * 100; }

    return function (data) {
      var rev = REV[data.revenue], cogs = COGS[data.costShare], ads = ADS[data.adspend];
      var lines = [], tooEarly = '';

      if (data.revenue === 'Pre-launch, nothing yet') {
        lines.push('You have not sold yet, so there is no margin to work back from — which means the first question is not what to spend, it is who opens the first drop. A launch into no audience is the most expensive way to find out whether the product works.');
        if (data.sellModel === 'Drops on a schedule' || data.sellModel === 'A bit of both') {
          lines.push('You are planning to sell in drops. That decides the shape of everything before it: a drop is won or lost by the size and warmth of the list it opens to, not by what happens on the day.');
        }
      } else if (typeof rev === 'number') {
        if (typeof cogs !== 'number') {
          lines.push('You are doing roughly ' + money(rev) + ' a month and you were not sure what a unit costs you to make. That is the honest answer most brands give, and it is also the one number every decision about paid spend hangs on — without it, any budget we set would be a guess wearing a spreadsheet.');
        } else {
          var gp = rev * (1 - cogs);
          lines.push('At roughly ' + money(rev) + ' a month with about ' + Math.round(cogs * 100) + '% of the price going on cost, you are keeping in the region of ' + money(gp) + ' a month in gross profit. That is the number worth running everything against — not revenue, and not what the ad platform reports back to you.');
          if (typeof ads === 'number') {
            if (ads === 0) {
              lines.push('And none of it is going into acquisition yet. So every order you take is coming from people who already found you — which is a real asset, and also a ceiling you will meet whether or not you choose to.');
            } else {
              var share = ads / gp;
              if (share >= 0.45) lines.push('You are putting somewhere near ' + Math.round(share * 100) + '% of that gross profit into ads. Past roughly a third, spend stops behaving like growth and starts behaving like rent — the first thing to look at is contribution per order, not the return the platform shows you.');
              else if (share <= 0.1) lines.push('Against that, spending around ' + money(ads) + ' a month is conservative — there is room in the margin, and the thing stopping it being used is usually confidence in what an order is actually worth, not appetite.');
              else lines.push('Spending around ' + money(ads) + ' a month against that margin is a workable place to start from. Whether it should be more depends on what a customer is worth the second time, which is the part almost nobody has measured.');
            }
          }
          /* FIN-PRI-004 gates on GROSS PROFIT. If ours would swallow it, say so here rather
             than on the call — and it must never be the line that gets dropped. */
          if (gp > 0 && gp < 3500) {
            tooEarly = 'Straight answer while you are here: at that level of gross profit our retainer would be a large share of what the business keeps. We will still read this and reply — but if we think it is too early, we will tell you that and what we would do first instead.';
          }
        }
      }
      if (!lines.length) return null;
      return { first: lines[0], second: tooEarly || lines[1] || '' };
    };
  })();

  /* ── helpers ─────────────────────────────────────────────────────────────── */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  /* "{{key|fallback}}" → data.key, or the fallback, or ''. The only templating here, and it
     exists so a spec can shape the payload its endpoint expects without engine changes. */
  function fill(tpl, data) {
    return String(tpl).replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, function (_, k, alt) {
      var v = (data[k] || '').trim();
      return v || (alt || '');
    });
  }

  /* ── Telemetry ───────────────────────────────────────────────────────────────
     Which step a visit reached, never what they typed. Fire-and-forget: a failed beacon
     must never be able to cost a lead, so every call swallows its own errors and nothing
     downstream waits on it. */
  function sessionId() {
    try {
      var k = 'ke_funnel_sid', v = sessionStorage.getItem(k);
      if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'nostore' + Date.now().toString(36); }
  }

  function emit(spec, event, stepKey, stepIndex, totalSteps) {
    try {
      var body = JSON.stringify({
        funnel: spec.name, event: event, stepKey: stepKey || null,
        stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
        totalSteps: typeof totalSteps === 'number' ? totalSteps : null,
        session: sessionId(),
        attribution: global.keAttribution ? global.keAttribution() : null
      });
      /* sendBeacon survives the page being closed mid-funnel, which is exactly the
         visit we most want to have recorded. fetch is the fallback. */
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/funnel-event', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/funnel-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true })
          .catch(function () {});
      }
    } catch (e) { /* telemetry never breaks the funnel */ }
  }

  function Funnel(spec, root) {
    this.spec = spec;
    this.root = root;
    this.data = {};
    this.i = 0;
    this.steps = [];
  }

  Funnel.prototype.build = function () {
    var self = this, spec = this.spec, form = el('form');
    form.id = 'f';
    form.setAttribute('novalidate', '');

    spec.steps.forEach(function (s, idx) {
      var sec = el('section', 'step' + (idx === 0 ? ' on' : ''));
      sec.dataset.key = s.key;
      if (idx === 0 && spec.eyebrow) sec.appendChild(el('div', 'smallcaps', spec.eyebrow));

      var h = el('h1', 'q'); h.textContent = s.q; sec.appendChild(h);

      /* `why` carries <em> for the serif accent, so it is the one place innerHTML is used —
         and it is OUR copy from OUR spec file, never anything a visitor typed. */
      var why = null;
      if (s.why) { why = el('p', 'why'); why.innerHTML = s.why; }
      if (why && !s.whyAfter) sec.appendChild(why);

      if (s.type === 'choice') {
        var opts = el('div', 'answer opts');
        opts.setAttribute('role', 'group');
        if (s.aria) opts.setAttribute('aria-label', s.aria);
        s.options.forEach(function (label) {
          var b = el('button', 'opt', label);
          b.type = 'button';
          b.setAttribute('aria-pressed', 'false');
          b.addEventListener('click', function () {
            opts.querySelectorAll('.opt').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
            b.setAttribute('aria-pressed', 'true');
            self.data[s.key] = b.textContent.trim();
            setTimeout(function () { self.next(); }, 140);   // a beat, so the selection is visible
          });
          opts.appendChild(b);
        });
        sec.appendChild(opts);
      } else {
        (s.fields || []).forEach(function (f, fi) {
          var wrap = el('div', 'answer');
          var input = f.type === 'textarea' ? el('textarea') : el('input');
          if (f.type !== 'textarea') input.type = f.type || 'text';
          input.id = f.id;
          if (f.placeholder) input.placeholder = f.placeholder;
          if (f.autocomplete) input.setAttribute('autocomplete', f.autocomplete);
          wrap.appendChild(input);
          sec.appendChild(wrap);
          if (why && s.whyAfter === fi + 1) sec.appendChild(why);
        });
      }
      if (s.review) { var r = el('div', 'review'); r.id = 'review'; r.hidden = true; sec.appendChild(r); }
      form.appendChild(sec);
      self.steps.push(sec);
    });

    var err = el('p', 'err'); err.id = 'err'; err.setAttribute('role', 'alert');
    var nav = el('div', 'nav');
    var go = el('button', 'go', (spec.cta && spec.cta.next) || 'Continue'); go.type = 'button'; go.id = 'go';
    var back = el('button', 'back', 'Back'); back.type = 'button'; back.id = 'back';
    nav.appendChild(go); nav.appendChild(back);
    form.appendChild(err); form.appendChild(nav);

    var done = el('div', 'done'); done.id = 'done'; done.hidden = true;
    if (spec.done) {
      if (spec.done.eyebrow) done.appendChild(el('div', 'smallcaps', spec.done.eyebrow));
      done.appendChild(el('h1', null, spec.done.h1 || 'Got it.'));
      var read = el('div', 'read'); read.id = 'read'; read.hidden = true;
      read.appendChild(el('p', 'read-lede', 'Before anyone here has opened it, here is what your answers already say.'));
      read.appendChild(function () { var p = el('p'); p.id = 'read-1'; return p; }());
      read.appendChild(function () { var p = el('p'); p.id = 'read-2'; return p; }());
      read.appendChild(el('p', 'read-note', 'Rough, because they are ranges. We will do it properly with your real numbers on the call — and if we think it is too early, we will say that instead of selling you something.'));
      done.appendChild(read);
      var body = el('p'); body.innerHTML = spec.done.body || ''; done.appendChild(body);
    }

    this.root.appendChild(form);
    this.root.appendChild(done);
    this.form = form; this.done = done; this.err = err; this.go = go; this.back = back;

    go.addEventListener('click', function () { self.next(); });
    back.addEventListener('click', function () { self.capture(); if (self.i > 0) { emit(self.spec, 'back', self.spec.steps[self.i].key, self.i, self.steps.length); self.i--; self.render(); } });
    form.addEventListener('submit', function (e) { e.preventDefault(); self.next(); });
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); self.next(); }
    });
    this.render();
    return this;
  };

  Funnel.prototype.capture = function () {
    var s = this.steps[this.i], fields = s.querySelectorAll('input,textarea');
    for (var n = 0; n < fields.length; n++) this.data[fields[n].id || s.dataset.key] = fields[n].value.trim();
    return s;
  };

  Funnel.prototype.valid = function (sec) {
    var spec = this.spec.steps[this.i], v = (this.data[spec.key] || '').trim();
    if (spec.required && !v) return spec.required;
    if (spec.type === 'email' && v && (v.indexOf('@') < 1 || v.indexOf('.') < 0)) return spec.emailError || 'That email does not look right.';
    return '';
  };

  Funnel.prototype.render = function () {
    var self = this;
    if (this.seen !== this.i) {
      this.seen = this.i;
      emit(this.spec, 'view', this.spec.steps[this.i].key, this.i, this.steps.length);
    }
    this.steps.forEach(function (s, n) { s.classList.toggle('on', n === self.i); });
    this.err.textContent = '';
    this.back.hidden = this.i === 0;
    var last = this.i === this.steps.length - 1;
    this.go.textContent = last ? ((this.spec.cta && this.spec.cta.send) || 'Send') : ((this.spec.cta && this.spec.cta.next) || 'Continue');
    var c = document.getElementById('count');
    if (c) c.textContent = (this.i + 1) + ' of ' + this.steps.length;
    var f = this.steps[this.i].querySelector('input,textarea') || this.steps[this.i].querySelector('.opt');
    if (f && f.focus) f.focus();
  };

  Funnel.prototype.next = function () {
    var sec = this.capture(), problem = this.valid(sec);
    if (problem) { this.err.textContent = problem; return; }
    if (this.i < this.steps.length - 1) { this.i++; this.render(); return; }
    this.send();
  };

  Funnel.prototype.readBack = function () {
    var fn = REVEALS[this.spec.reveal];
    if (!fn) return;
    var out = fn(this.data);
    if (!out) return;
    var wrap = document.getElementById('read'), one = document.getElementById('read-1'), two = document.getElementById('read-2');
    if (!wrap || !one) return;
    one.textContent = out.first;
    if (out.second) two.textContent = out.second; else two.hidden = true;
    wrap.hidden = false;
  };

  Funnel.prototype.send = function () {
    var self = this, spec = this.spec;
    this.go.disabled = true; this.err.textContent = ''; this.go.textContent = 'Sending…';
    emit(spec, 'submit', null, this.steps.length - 1, this.steps.length);
    var body = {};
    Object.keys(spec.payload || {}).forEach(function (k) { body[k] = fill(spec.payload[k], self.data); });
    body.attribution = global.keAttribution ? global.keAttribution() : null;
    body.source = spec.name;
    fetch(spec.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw 0; })
      .then(function () {
        self.form.hidden = true;
        var c = document.getElementById('count'); if (c) c.textContent = '';
        self.readBack();
        emit(spec, 'complete', null, self.steps.length, self.steps.length);
        self.done.hidden = false;
        var h = self.done.querySelector('h1'); if (h && h.focus) h.focus();
      })
      .catch(function () {
        self.go.disabled = false;
        self.go.textContent = (spec.cta && spec.cta.send) || 'Send';
        self.err.textContent = 'That did not send. Email diego@kaizenevol.com and we will pick it up there.';
      });
  };

  global.KEFunnel = {
    reveals: REVEALS,
    mount: function (spec, root) { return new Funnel(spec, root).build(); },
    load: function (name, root) {
      return fetch('/funnels/' + name + '.json')
        .then(function (r) { if (!r.ok) throw new Error('no such funnel: ' + name); return r.json(); })
        .then(function (spec) { return new Funnel(spec, root).build(); });
    }
  };
})(window);
