/* =========================================================
   Best-effort per-IP rate limit for the gio signup.

   IMPORTANT (SOP 5.1 / 14): a conference venue is ONE NAT IP.
   Every booth visitor shares it, so a hard per-IP limit would
   block real signups. Default is OFF (mode='off') — the honeypot
   is the primary bot defence. Turn it on only if you see abuse:
     GIO_RATE_LIMIT = on        (in-memory sliding window; per warm container, not global)
   Tune with GIO_RATE_MAX (default 30) and GIO_RATE_WINDOW_MS (default 60000).
   ========================================================= */

var HITS = new Map(); // ip -> array of epoch-ms timestamps (this container only)

function env(name, fallback) {
  var v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

async function checkRateLimit(ip) {
  var mode = String(env('GIO_RATE_LIMIT', 'off')).toLowerCase();
  if (mode !== 'on') return { ok: true, mode: 'off' };

  var max = parseInt(env('GIO_RATE_MAX', '30'), 10) || 30;
  var windowMs = parseInt(env('GIO_RATE_WINDOW_MS', '60000'), 10) || 60000;
  var key = ip || 'unknown';
  var now = Date.now();
  var arr = (HITS.get(key) || []).filter(function (t) { return now - t < windowMs; });
  arr.push(now);
  HITS.set(key, arr);

  // Opportunistic cleanup so the Map cannot grow unbounded on a warm container.
  if (HITS.size > 5000) {
    HITS.forEach(function (v, k) {
      var kept = v.filter(function (t) { return now - t < windowMs; });
      if (kept.length) HITS.set(k, kept); else HITS.delete(k);
    });
  }

  return { ok: arr.length <= max, remaining: Math.max(0, max - arr.length), mode: 'on' };
}

module.exports = { checkRateLimit };
