/* SmartHomeEv mockup behaviour: vanilla, no network. Every hook is a data-attribute. */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var de = function (n, d) { return Number(n).toLocaleString('de-DE', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function say(target, text) {
    var el = target ? document.getElementById(target) : null;
    if (el) { var t = $('.live-text', el); (t || el).textContent = text; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
  }

  /* segmented controls: one pressed button per group */
  $$('[data-seg]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled) return;
      $$('button', g).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      g.dispatchEvent(new CustomEvent('seg-change', { bubbles: true, detail: b.dataset.value || b.textContent.trim() }));
    });
  });

  /* toggle buttons (aria-pressed) */
  $$('[data-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      var dev = b.closest('[data-device]');
      if (dev) dev.classList.toggle('is-on', on);
      if (b.dataset.say) say(b.dataset.target, on ? b.dataset.say : (b.dataset.sayOff || ''));
    });
  });

  /* switches (role=switch) */
  $$('[role="switch"]').forEach(function (s) {
    s.addEventListener('click', function () {
      if (s.getAttribute('aria-disabled') === 'true') return;
      var on = s.getAttribute('aria-checked') !== 'true';
      s.setAttribute('aria-checked', String(on));
      var scope = s.closest('[data-device], .rule');
      if (scope) {
        if (scope.classList.contains('rule')) scope.classList.toggle('is-off', !on);
        else scope.classList.toggle('is-on', on);
        var st = $('[data-state-text]', scope);
        if (st) st.textContent = on ? (st.dataset.on || 'an') : (st.dataset.off || 'aus');
      }
    });
  });

  /* steppers */
  $$('[data-stepper]').forEach(function (st) {
    var v = $('[data-value]', st), min = +st.dataset.min, max = +st.dataset.max, step = +st.dataset.step, dec = +(st.dataset.dec || 0);
    var cur = +st.dataset.now, unit = st.dataset.unit || '';
    function paint(anim) {
      v.firstChild.nodeValue = de(cur, dec);
      $$('button', st).forEach(function (b) { b.disabled = (+b.dataset.dir < 0 && cur <= min) || (+b.dataset.dir > 0 && cur >= max); });
      if (anim) { v.classList.remove('tick'); void v.offsetWidth; v.classList.add('tick'); }
    }
    st.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled) return;
      cur = Math.min(max, Math.max(min, Math.round((cur + step * +b.dataset.dir) * 100) / 100));
      paint(true);
      if (st.dataset.target) say(st.dataset.target, st.dataset.say ? st.dataset.say.replace('{v}', de(cur, dec) + unit) : '');
    });
    paint(false);
  });

  /* ranges: fill, readout, optional room glow */
  $$('input[type="range"][data-out]').forEach(function (r) {
    function paint() {
      var p = (r.value - r.min) / (r.max - r.min) * 100;
      r.style.setProperty('--val', p + '%');
      var o = document.getElementById(r.dataset.out);
      if (o) { o.firstChild.nodeValue = de(r.value); o.classList.remove('tick'); void o.offsetWidth; o.classList.add('tick'); }
      if (r.dataset.lit) { var sh = $(r.dataset.lit); if (sh) sh.style.setProperty('--lit', String(r.value / 100)); }
    }
    r.addEventListener('input', paint);
    paint();
  });

  /* alerts: acknowledge and move to the acknowledged list */
  function recount() {
    var list = $('[data-alert-list]');
    if (!list) return;
    var n = $$('.alert-row:not(.is-ack)', list).length;
    $$('[data-alert-count]').forEach(function (c) { c.textContent = n; });
    $$('.badge-alarm').forEach(function (b) { b.dataset.zero = String(n === 0); });
    var empty = $('[data-empty]');
    if (empty) empty.hidden = n !== 0;
    var cnt = $('[data-active-count]');
    if (cnt) cnt.textContent = n;
  }
  $$('[data-ack]').forEach(function (b) {
    b.addEventListener('click', function () {
      var row = b.closest('.alert-row');
      row.classList.add('is-ack');
      var note = $('.ack-note span', row);
      if (note) note.textContent = 'Bestätigt ' + ((window.__simClock && window.__simClock()) || '07:42');
      var dest = $('[data-ack-list]');
      if (dest) dest.insertBefore(row, dest.firstChild);
      recount();
    });
  });
  recount();

  /* simulation clock (index) */
  var clock = $('[data-clock]');
  if (clock) {
    var days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    var dayEl = $('[data-clock-day]', clock), hmEl = $('[data-clock-hm]', clock);
    var band = clock.closest('.clock-band');
    var parts = hmEl.textContent.split(':');
    var minutes = (+parts[0]) * 60 + (+parts[1]);
    var day = days.indexOf(dayEl.textContent.trim());
    var speed = 60, running = true, lastShown = '';
    function hm() { var m = Math.floor(minutes) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
    window.__simClock = hm;
    function paint() {
      var s = hm();
      if (s !== lastShown) {
        hmEl.textContent = s; dayEl.textContent = days[(day + Math.floor(minutes / 1440)) % 7]; lastShown = s;
        if (!reduce) { hmEl.classList.remove('tick'); void hmEl.offsetWidth; hmEl.classList.add('tick'); }
      }
    }
    setInterval(function () { if (running) { minutes += speed / 60; paint(); } }, 1000);
    var seg = $('[data-speed]');
    if (seg) seg.addEventListener('seg-change', function (e) { speed = parseInt(e.detail, 10) || 1; });
    var play = $('[data-play]');
    if (play) play.addEventListener('click', function () {
      running = play.getAttribute('aria-pressed') !== 'true' ? false : true;
      play.setAttribute('aria-pressed', String(!running));
      band.classList.toggle('is-paused', !running);
      var pn = $('[data-paused-note]'); if (pn) pn.hidden = running;
    });
    var rs = $('[data-reset]');
    if (rs) rs.addEventListener('click', function () { minutes = 6 * 60; day = days.indexOf('Mi'); lastShown = ''; paint(); });
  }

  /* history: metric + room chips */
  var metrics = $('[data-metrics]');
  if (metrics) {
    var rooms = $('[data-rooms]');
    var metric = 'temp', room = 'all';
    function apply() {
      $$('[data-chart]').forEach(function (c) { c.hidden = c.dataset.chart !== metric; });
      $$('[data-room]').forEach(function (el) {
        var r = el.dataset.room;
        el.hidden = !(room === 'all' || r === room || r === 'out');
      });
      var whole = metric === 'energy';
      $$('button', rooms).forEach(function (b) { b.setAttribute('aria-disabled', String(whole)); });
      var t = $('[data-chart-title]'), titles = { temp: 'Raumtemperaturen gegen Außen', hum: 'Luftfeuchte je Raum', co2: 'CO2 je Raum gegen die Grenze', energy: 'Verbrauch gegen Solarertrag' };
      if (t) t.textContent = titles[metric];
    }
    metrics.addEventListener('seg-change', function (e) { var b = $('[aria-pressed="true"]', metrics); metric = b.dataset.value; apply(); });
    rooms.addEventListener('seg-change', function () { var b = $('[aria-pressed="true"]', rooms); room = b.dataset.value; apply(); });
    rooms.addEventListener('click', function (e) { if (metric === 'energy') { e.stopImmediatePropagation(); } }, true);
    apply();
  }

  /* automations */
  $$('[data-rule-del]').forEach(function (b) {
    b.addEventListener('click', function () {
      var row = b.closest('.rule'); var name = row.dataset.name;
      row.remove();
      say('rule-status', 'Gelöscht: ' + name);
      var left = $$('.rule').length; var c = $('[data-rule-count]'); if (c) c.textContent = left;
    });
  });
  $$('[data-rule-edit]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.rule').forEach(function (r) { r.classList.remove('is-editing'); });
      var row = b.closest('.rule'); row.classList.add('is-editing');
      var n = $('#rule-name'); if (n) { n.value = row.dataset.name; n.focus(); }
      say('rule-status', 'Bearbeiten: ' + row.dataset.name);
    });
  });
  var neu = $('[data-rule-new]');
  if (neu) neu.addEventListener('click', function () {
    $$('.rule').forEach(function (r) { r.classList.remove('is-editing'); });
    var n = $('#rule-name'); if (n) { n.value = ''; n.focus(); }
    say('rule-status', 'Neue Automation – Name und Regel eintragen');
  });
  var save = $('[data-rule-save]');
  if (save) save.addEventListener('click', function () {
    var n = $('#rule-name');
    if (n && !n.value.trim()) { n.setAttribute('aria-invalid', 'true'); var er = $('#rule-name-error'); if (er) er.hidden = false; n.focus(); return; }
    if (n) n.removeAttribute('aria-invalid');
    var er2 = $('#rule-name-error'); if (er2) er2.hidden = true;
    say('rule-status', 'Gespeichert: ' + (n ? n.value : ''));
  });
  var rn = $('#rule-name');
  if (rn) rn.addEventListener('input', function () { rn.removeAttribute('aria-invalid'); var er = $('#rule-name-error'); if (er) er.hidden = true; });
  $$('[data-preview-src] select, [data-preview-src] input').forEach(function (f) {
    f.addEventListener('input', function () {
      var g = function (id) { var e = document.getElementById(id); return e ? (e.tagName === 'SELECT' ? e.options[e.selectedIndex].text : e.value) : ''; };
      var p = $('[data-preview]');
      if (p) p.innerHTML = '';
      if (p) {
        var parts = [['Wenn ', 0], [g('f-sensor') + ' ' + g('f-op') + ' ' + g('f-val') + ' ' + g('f-unit'), 1], [', dann ', 0], [g('f-device') + ' ' + g('f-action').toLowerCase(), 1], ['.', 0]];
        parts.forEach(function (x) { var n = x[1] ? document.createElement('b') : document.createElement('span'); n.textContent = x[0]; p.appendChild(n); });
      }
    });
  });

  /* simulation: events, apply, reset */
  $$('[data-event]').forEach(function (b) {
    b.addEventListener('click', function () {
      b.classList.add('is-fired');
      var s = $('.event-btn__status', b);
      if (s) s.textContent = 'Ausgelöst ' + ((window.__simClock && window.__simClock()) || 'Mi 07:42');
      say('sim-status', b.dataset.event + ' ausgelöst – Alarm erscheint in der Übersicht');
    });
  });
  $$('[data-say-click]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.clearEvents) $$('[data-event]').forEach(function (e) { e.classList.remove('is-fired'); var s = $('.event-btn__status', e); if (s) s.textContent = 'Bereit'; });
      say(b.dataset.target, b.dataset.sayClick);
    });
  });
})();
