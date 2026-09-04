/* Draws the seat marks. Reads data-seats (the cap) and the OPTIONAL data-taken.
   With no data-taken, every mark renders the same and the row states the cap only. */
(function(){
  var els = document.querySelectorAll('[data-seats]');
  for (var n = 0; n < els.length; n++) {
    var el = els[n],
        cap = parseInt(el.getAttribute('data-seats'), 10) || 0,
        takenAttr = el.getAttribute('data-taken'),
        taken = takenAttr === null ? -1 : parseInt(takenAttr, 10),
        row = document.createElement('span');
    row.className = 'seats';
    row.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < cap; i++) {
      var m = document.createElement('i');
      if (taken > -1 && i < taken) m.className = 'taken';
      row.appendChild(m);
    }
    el.insertBefore(row, el.firstChild);
  }
})();
