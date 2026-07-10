/* =========================================================
   Adya — GIO Connect landing form (io/*)
   Reuses the site's AdyaSheets.submit() network core, but owns
   the UX: platform hidden field, conditional team-size reveal,
   honeypot, source cookie, and the inline (no-redirect) confirmation.
   Loaded with `defer`. Depends on /io/assets/sheets-submit.js.
   ========================================================= */
(function () {
  'use strict';

  var PLATFORM_NAMES = { vanij: 'Vanij', gtm: 'GTM', ras: 'RAS' };

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var platform = (window.IO_PLATFORM || 'vanij').toLowerCase();
    if (!PLATFORM_NAMES[platform]) platform = 'vanij';
    var platformName = PLATFORM_NAMES[platform];

    // Attribution cookie — no UTM in the QR (SOP 4.2); source is set here on landing.
    try {
      document.cookie = 'source=google_io_connect;path=/;max-age=604800;samesite=lax';
    } catch (e) { /* cookies disabled — attribution still logged server-side via referer/UA */ }

    var form = document.getElementById('io-form');
    if (!form) return;

    // Hidden platform field, pre-filled from the route.
    var platformField = form.querySelector('[name="platform"]');
    if (platformField) platformField.value = platform;

    // Any element tagged data-platform-name gets the readable name injected.
    var nameSlots = document.querySelectorAll('[data-platform-name]');
    for (var i = 0; i < nameSlots.length; i++) nameSlots[i].textContent = platformName;

    // Conditional team-size reveal.
    var teamCheckbox = form.querySelector('#io-team');
    var teamWrap = form.querySelector('#io-team-size-wrap');
    var teamSelect = form.querySelector('#io-team-size');
    function syncTeam() {
      var on = teamCheckbox && teamCheckbox.checked;
      if (teamWrap) teamWrap.hidden = !on;
      if (teamSelect) teamSelect.disabled = !on; // disabled → not submitted when hidden
    }
    if (teamCheckbox) {
      teamCheckbox.addEventListener('change', syncTeam);
      syncTeam();
    }

    var statusEl = form.querySelector('[data-adya-form-status]');
    var submitBtn = form.querySelector('[type="submit"]');
    var confirmEl = document.getElementById('io-confirm');

    function showConfirmation() {
      // Inline confirmation, no redirect (SOP 5.1).
      if (confirmEl) {
        var line = confirmEl.querySelector('[data-confirm-line]');
        if (line) line.textContent = 'You are in. Check your email for the link to open ' + platformName + ' on your laptop.';
        form.hidden = true;
        confirmEl.hidden = false;
        confirmEl.setAttribute('tabindex', '-1');
        confirmEl.focus();
      } else if (statusEl) {
        statusEl.style.color = '#7EE7A8';
        statusEl.textContent = 'You are in. Check your email for the link to open ' + platformName + ' on your laptop.';
      }
    }

    function showError(msg) {
      if (statusEl) {
        statusEl.style.color = '#FFB4A8';
        statusEl.textContent = msg || 'Something went wrong. Please try again.';
      } else {
        alert(msg || 'Something went wrong. Please try again.');
      }
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (statusEl) statusEl.textContent = '';

      // Honeypot — a real user never fills this hidden field.
      var honey = form.querySelector('[name="company_url"]');
      if (honey && honey.value) { showConfirmation(); return; } // fake success, no network

      // HTML5 validity (required fields, email format).
      if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;

      var api = window.AdyaSheets;
      if (!api || typeof api.submit !== 'function') {
        showError('Form is still loading. Please try again in a moment.');
        return;
      }

      var data = api.formData(form);          // collects + normalizes all named fields
      delete data.company_url;                 // never transmit the honeypot
      data.platform = platform;
      data.source = 'google_io_connect';
      data.event = 'gio_connect_2026';
      data.team_flag = (teamCheckbox && teamCheckbox.checked) ? 'true' : 'false';
      if (!data.team_flag || data.team_flag === 'false') delete data.team_size;
      data.marketing_consent = form.querySelector('#io-consent') && form.querySelector('#io-consent').checked ? 'true' : 'false';

      var restore = api.setButtonLoading(submitBtn, 'Sending…');
      api.submit('gio', data, { formName: 'gio_' + platform })
        .then(function () { showConfirmation(); })
        .catch(function (err) { showError(err && err.message); })
        .then(function () { if (typeof restore === 'function') restore(); });
    });
  });
})();
