/* =========================================================
   gio-open — the idempotent tracked redirect behind the E1 email button.
   Route: /api/io/open?p=<platform>&lead=<id>

   Flow:
     1. detect mobile vs desktop from the User-Agent
     2. log the click (best-effort, never blocks the redirect)
     3. 302:  mobile  -> /io/desktop-required/?p=..   (do NOT open the product on a phone)
              desktop -> the product signup URL for that platform

   There is NO single-use token: the link is safe to open on mobile and then
   again on desktop. This deliberately removes the SOP 14 "token consumed by
   mobile interstitial -> users locked out" risk. Attribution is by click log.
   ========================================================= */

var sheets = require('./sheets-submit-handler.cjs');
var email = require('./gio-email.cjs');

var env = sheets.env;
var MOBILE_RE = /Mobi|Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|Opera Mini|IEMobile|Silk/i;

function isMobileUA(ua) {
  return MOBILE_RE.test(String(ua || ''));
}

function productUrl(platform, leadId) {
  var map = {
    vanij: env('PRODUCT_SIGNUP_URL_VANIJ', 'https://vanij.adya.ai/orchestrator'),
    gtm: env('PRODUCT_SIGNUP_URL_GTM', 'https://gtm.adya.ai/orchestrator'),
    ras: env('PRODUCT_SIGNUP_URL_RAS', 'https://esa.adya.ai/')
  };
  var base = map[platform];
  if (!base) {
    // Env not set for this platform — fall back to the chooser rather than a broken redirect.
    console.error('gio-open: PRODUCT_SIGNUP_URL for "' + platform + '" is not set; falling back to /io/');
    return '/io/';
  }
  var sep = base.indexOf('?') === -1 ? '?' : '&';
  var qs = 'utm_source=google_io_connect&utm_medium=email&utm_campaign=gio_connect_2026' + (leadId ? '&lead=' + encodeURIComponent(leadId) : '');
  return base + sep + qs;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (resolve) { setTimeout(function () { resolve({ timedOut: true }); }, ms); })
  ]);
}

async function logClick(row) {
  var spreadsheetID = env('GOOGLE_SHEETS_SPREADSHEET_ID', '');
  if (!spreadsheetID) return; // nothing to log to
  var tab = env('GOOGLE_SHEETS_GIO_CLICKS_TAB', 'gio_clicks');
  var token = await sheets.getAccessToken();
  var sheetID = await sheets.ensureSheet(token, spreadsheetID, tab);
  var existing = await sheets.readHeaders(token, spreadsheetID, tab);
  var headers = sheets.headerUnion(existing, Object.keys(row));
  if (headers.join('') !== existing.join('')) {
    await sheets.writeHeaders(token, spreadsheetID, tab, headers);
    await sheets.boldHeader(token, spreadsheetID, sheetID, headers.length);
  }
  var values = headers.map(function (h) { return row[h] == null ? '' : row[h]; });
  await sheets.appendRow(token, spreadsheetID, tab, headers, values);
}

function redirect(location) {
  return {
    statusCode: 302,
    headers: { location: location, 'cache-control': 'no-store' },
    body: ''
  };
}

async function handleOpen(input) {
  input = input || {};
  var method = input.method || 'GET';
  var headers = input.headers || {};
  var query = input.query || {};

  if (method !== 'GET' && method !== 'HEAD') {
    return { statusCode: 405, headers: { allow: 'GET', 'cache-control': 'no-store' }, body: 'Method not allowed' };
  }

  var platform = email.normalizePlatform(query.p);
  var leadId = String(query.lead || '').slice(0, 64);
  var ua = sheets.requestHeader(headers, 'user-agent');
  var device = isMobileUA(ua) ? 'mobile' : 'desktop';

  // Best-effort click log — bounded so a slow Sheets call never delays the user.
  try {
    await withTimeout(logClick({
      timestamp_utc: new Date().toISOString(),
      event: 'gio_connect_2026',
      platform: platform,
      lead_id: leadId,
      device: device,
      user_agent: ua,
      ip: sheets.clientIP(headers)
    }), 1200);
  } catch (e) {
    console.error('gio-open click log failed (redirect continues):', e && e.message);
  }

  if (device === 'mobile') {
    // Relative redirect — stays on whatever domain this is deployed to (no SITE_ORIGIN needed).
    return redirect('/io/desktop-required/?p=' + encodeURIComponent(platform) + (leadId ? '&lead=' + encodeURIComponent(leadId) : ''));
  }
  return redirect(productUrl(platform, leadId));
}

module.exports = { handleOpen, isMobileUA, productUrl };
