/* Draws the seat marks. Reads data-seats (the cap) and the OPTIONAL data-taken.
   With no data-taken, every mark renders the same and the row states the cap only.
   A comma draws separate groups: "5,5" is five artists and five brands (Rahaid, 2026-09-30),
   each its own row of marks, side by side. data-taken takes one number per group. */
(function(){
  var els = document.querySelectorAll('[data-seats]');
  for (var n = 0; n < els.length; n++) {
    var el = els[n],
        caps = String(el.getAttribute('data-seats')).split(','),
        takenAttr = el.getAttribute('data-taken'),
        /* data-taken="2,1" fills per group (artists, brands); one number fills the first group. */
        takens = takenAttr === null ? [] : String(takenAttr).split(',').map(function(x){ return parseInt(x, 10); });
    /* data-seat-labels="Artists,Brands": each group gets its name and the groups sit on
       their own line above the text, instead of squeezing in front of it (2026-09-30). */
    var labelsAttr = el.getAttribute('data-seat-labels'),
        labels = labelsAttr ? labelsAttr.split(',') : null,
        host = el;
    if (labels) {
      host = document.createElement('span');
      host.className = 'seat-set';
      host.setAttribute('aria-hidden', 'true');
      el.insertBefore(host, el.firstChild);
    }
    for (var g = caps.length - 1; g >= 0; g--) {
      var cap = parseInt(caps[g], 10) || 0, row = document.createElement('span');
      row.className = 'seats';
      row.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < cap; i++) {
        var m = document.createElement('i');
        if (takens[g] > -1 && i < takens[g]) m.className = 'taken';
        row.appendChild(m);
      }
      if (labels) {
        var grp = document.createElement('span'), lab = document.createElement('span');
        grp.className = 'seat-group';
        lab.className = 'seat-label';
        lab.textContent = (labels[g] || '').trim();
        grp.appendChild(row); grp.appendChild(lab);
        host.insertBefore(grp, host.firstChild);
      } else {
        el.insertBefore(row, el.firstChild);
      }
    }
  }
})();
