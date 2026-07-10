const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { checkRateLimit } = require('./gio-ratelimit.cjs');

const SHEET_KEYS = new Set(['colleges', 'builders', 'demos', 'gio']);
const BASE_HEADERS = ['timestamp_utc', 'form_name', 'source_page', 'page_url', 'user_agent', 'ip'];
const MAX_BODY_BYTES = 128 * 1024;
const PROJECT_ROOT = path.resolve(__dirname, '..');

loadLocalEnv();

function unquoteEnvValue(value) {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadLocalEnv() {
  const candidates = [
    path.join(PROJECT_ROOT, '.env'),
    path.join(process.cwd(), '.env')
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const separator = line.indexOf('=');
      const key = line.slice(0, separator).trim();
      const value = unquoteEnvValue(line.slice(separator + 1));
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function isLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch (_error) {
    return false;
  }
}

function corsOrigin(requestOrigin) {
  const configured = env('ADYA_SHEETS_ALLOWED_ORIGIN', '*');
  if (!requestOrigin) return configured || '*';
  if (!configured || configured === '*') return requestOrigin;

  const allowed = configured.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (allowed.includes('*') || allowed.includes(requestOrigin)) return requestOrigin;

  // Keep local development ergonomic while preserving explicit production origins.
  if (isLocalOrigin(requestOrigin)) return requestOrigin;

  return allowed[0] || requestOrigin;
}

function json(statusCode, body, extraHeaders, requestOrigin) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': corsOrigin(requestOrigin),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'vary': 'Origin',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function normalizeHeader(key) {
  return String(key || '')
    .trim()
    .replace(/^df-/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

function normalizeData(data) {
  const normalized = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return normalized;

  for (const [rawKey, rawValue] of Object.entries(data)) {
    const key = normalizeHeader(rawKey);
    if (!key || BASE_HEADERS.includes(key)) continue;
    if (rawValue === undefined || rawValue === null) {
      normalized[key] = '';
    } else if (Array.isArray(rawValue)) {
      normalized[key] = rawValue.map((value) => String(value ?? '').trim()).filter(Boolean).join(', ');
    } else if (typeof rawValue === 'object') {
      normalized[key] = JSON.stringify(rawValue);
    } else {
      normalized[key] = String(rawValue).trim();
    }
  }

  return normalized;
}

function env(name, fallback) {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function normalizePlatform(p) {
  const v = String(p || '').trim().toLowerCase();
  return (v === 'gtm' || v === 'ras') ? v : 'vanij';
}

function makeLeadId() {
  return 'gio_' + crypto.randomBytes(6).toString('hex');
}

function originFromHeaders(headers) {
  const proto = String(requestHeader(headers, 'x-forwarded-proto') || 'https').split(',')[0].trim();
  const host = requestHeader(headers, 'x-forwarded-host') || requestHeader(headers, 'host') || '';
  return host ? proto + '://' + host : '';
}

function tabForSheet(sheet) {
  const map = {
    colleges: env('GOOGLE_SHEETS_COLLEGES_TAB', env('GOOGLE_SHEETS_COLLEGE_TAB', 'colleges')),
    builders: env('GOOGLE_SHEETS_BUILDERS_TAB', env('GOOGLE_SHEETS_BUILDER_TAB', 'builders')),
    demos: env('GOOGLE_SHEETS_DEMOS_TAB', env('GOOGLE_SHEETS_DEMO_TAB', 'demos')),
    gio: env('GOOGLE_SHEETS_GIO_TAB', 'gio')
  };
  return map[sheet];
}

function parseBody(body) {
  if (!body) return {};
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    const error = new Error('Request body is too large.');
    error.statusCode = 413;
    throw error;
  }
  return typeof body === 'string' ? JSON.parse(body) : body;
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getServiceAccount() {
  const rawJSON = env('GOOGLE_SERVICE_ACCOUNT_JSON', '');
  if (rawJSON) return JSON.parse(rawJSON);

  const clientEmail = env('GOOGLE_CLIENT_EMAIL', '');
  const privateKey = env('GOOGLE_PRIVATE_KEY', '').replace(/\\n/g, '\n');
  if (clientEmail && privateKey) {
    return { client_email: clientEmail, private_key: privateKey };
  }

  throw new Error('Missing Google Sheets credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.');
}

async function getAccessToken() {
  const account = getServiceAccount();
  if (!account.client_email || !account.private_key) {
    throw new Error('Google service account credentials are incomplete.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Unable to authenticate with Google Sheets.');
  }
  return payload.access_token;
}

function quoteTab(tab) {
  return `'${String(tab).replace(/'/g, "''")}'`;
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
}

async function sheetsFetch(token, path, options = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload.error || 'Google Sheets request failed.';
    throw new Error(message);
  }
  return payload;
}

async function ensureSheet(token, spreadsheetID, tab) {
  const spreadsheet = await sheetsFetch(token, `${spreadsheetID}?fields=sheets.properties(sheetId,title)`);
  const existing = spreadsheet.sheets?.find((sheet) => sheet.properties?.title === tab);
  if (existing) return existing.properties.sheetId;

  const created = await sheetsFetch(token, `${spreadsheetID}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tab } } }]
    })
  });
  return created.replies?.[0]?.addSheet?.properties?.sheetId;
}

async function readHeaders(token, spreadsheetID, tab) {
  const range = encodeURIComponent(`${quoteTab(tab)}!1:1`);
  const payload = await sheetsFetch(token, `${spreadsheetID}/values/${range}?majorDimension=ROWS`);
  return (payload.values?.[0] || []).map(normalizeHeader).filter(Boolean);
}

async function writeHeaders(token, spreadsheetID, tab, headers) {
  const endColumn = columnName(headers.length - 1);
  const range = encodeURIComponent(`${quoteTab(tab)}!A1:${endColumn}1`);
  await sheetsFetch(token, `${spreadsheetID}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [headers] })
  });
}

async function setRowsBold(token, spreadsheetID, sheetID, startRowIndex, endRowIndex, columnCount, bold) {
  if (typeof sheetID !== 'number') return;
  if (endRowIndex <= startRowIndex) return;
  await sheetsFetch(token, `${spreadsheetID}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        repeatCell: {
          range: {
            sheetId: sheetID,
            startRowIndex,
            endRowIndex,
            startColumnIndex: 0,
            endColumnIndex: Math.max(columnCount, 1)
          },
          cell: { userEnteredFormat: { textFormat: { bold } } },
          fields: 'userEnteredFormat.textFormat.bold'
        }
      }]
    })
  });
}

async function boldHeader(token, spreadsheetID, sheetID, headerCount) {
  return setRowsBold(token, spreadsheetID, sheetID, 0, 1, headerCount, true);
}

function endRowIndexFromUpdatedRange(updatedRange) {
  const range = String(updatedRange || '').split('!').pop() || '';
  const rowNumbers = range.match(/\d+/g);
  if (!rowNumbers || rowNumbers.length === 0) return 0;
  return Math.max(...rowNumbers.map((value) => Number(value)).filter(Number.isFinite));
}

async function appendRow(token, spreadsheetID, tab, headers, row) {
  const endColumn = columnName(headers.length - 1);
  const range = encodeURIComponent(`${quoteTab(tab)}!A:${endColumn}`);
  const payload = await sheetsFetch(token, `${spreadsheetID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] })
  });
  if (payload.updates && payload.updates.updatedRows !== 1) {
    throw new Error('Google Sheets accepted the request but did not append a row.');
  }
  return payload.updates || {};
}

async function normalizeDataRows(token, spreadsheetID, sheetID, headerCount, appendResult) {
  const endRowIndex = endRowIndexFromUpdatedRange(appendResult.updatedRange);
  if (endRowIndex <= 1) return;
  await setRowsBold(token, spreadsheetID, sheetID, 1, endRowIndex, headerCount, false);
}

function headerUnion(existing, dataKeys) {
  const headers = existing.length ? [...existing] : [...BASE_HEADERS];
  for (const baseHeader of BASE_HEADERS) {
    if (!headers.includes(baseHeader)) headers.push(baseHeader);
  }
  for (const key of dataKeys) {
    if (!headers.includes(key)) headers.push(key);
  }
  return headers;
}

function requestHeader(headers, name) {
  const lowerName = name.toLowerCase();
  return headers?.[name] || headers?.[lowerName] || headers?.[name.toUpperCase()] || '';
}

function clientIP(headers) {
  return String(requestHeader(headers, 'x-forwarded-for') || requestHeader(headers, 'x-real-ip') || '')
    .split(',')[0]
    .trim();
}

async function handleSubmission({ method, headers = {}, body }) {
  const origin = requestHeader(headers, 'origin');
  if (method === 'OPTIONS') return json(204, {}, {}, origin);
  if (method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' }, { allow: 'POST, OPTIONS' }, origin);

  try {
    const payload = parseBody(body);
    const sheet = String(payload.sheet || '').trim().toLowerCase();
    if (!SHEET_KEYS.has(sheet)) {
      return json(400, { ok: false, error: 'Invalid sheet. Use colleges, builders, demos, or gio.' }, {}, origin);
    }

    // gio pre-flight: honeypot + best-effort rate limit, before any Sheets work.
    if (sheet === 'gio') {
      const rawData = (payload && payload.data) || {};
      if (String(rawData.company_url || '').trim()) {
        // Honeypot tripped: pretend success so bots move on. Nothing written, no email.
        return json(200, { ok: true, sheet: 'gio', spam: true }, {}, origin);
      }
      try {
        const rl = await checkRateLimit(clientIP(headers));
        if (rl && rl.ok === false) {
          return json(429, { ok: false, error: 'Too many submissions. Please wait a minute and try again.' }, {}, origin);
        }
      } catch (rlErr) { /* rate-limit failure must never block a real signup */ }
    }

    const spreadsheetID = env('GOOGLE_SHEETS_SPREADSHEET_ID', '');
    if (!spreadsheetID) {
      throw new Error('Missing GOOGLE_SHEETS_SPREADSHEET_ID.');
    }

    const data = normalizeData(payload.data);
    if (sheet === 'gio') {
      data.event = 'gio_connect_2026';
      data.source = data.source || 'google_io_connect';
      data.platform = normalizePlatform(data.platform);
      if (!data.lead_id) data.lead_id = makeLeadId();
    }
    const tab = tabForSheet(sheet);
    const token = await getAccessToken();
    const sheetID = await ensureSheet(token, spreadsheetID, tab);
    const existingHeaders = await readHeaders(token, spreadsheetID, tab);
    const headersForRow = headerUnion(existingHeaders, Object.keys(data));

    if (headersForRow.join('\u0001') !== existingHeaders.join('\u0001')) {
      await writeHeaders(token, spreadsheetID, tab, headersForRow);
      await boldHeader(token, spreadsheetID, sheetID, headersForRow.length);
    }

    const metadata = {
      timestamp_utc: new Date().toISOString(),
      form_name: String(payload.form_name || ''),
      source_page: String(payload.source_page || ''),
      page_url: String(payload.page_url || ''),
      user_agent: requestHeader(headers, 'user-agent'),
      ip: clientIP(headers)
    };
    const row = headersForRow.map((header) => metadata[header] ?? data[header] ?? '');
    const appendResult = await appendRow(token, spreadsheetID, tab, headersForRow, row);
    await normalizeDataRows(token, spreadsheetID, sheetID, headersForRow.length, appendResult);

    // gio: send the E1 welcome email. Lead is already saved, so a mail failure
    // must NOT fail the request — the visitor still sees the inline confirmation.
    let emailQueued = false;
    if (sheet === 'gio') {
      try {
        const { sendGioEmail } = require('./gio-email.cjs');
        await sendGioEmail({
          platform: data.platform,
          email: data.work_email || data.email,
          name: data.full_name || data.name,
          leadId: data.lead_id,
          siteOrigin: originFromHeaders(headers) || undefined
        });
        emailQueued = true;
      } catch (mailErr) {
        console.error('gio E1 email failed (lead saved, will need a resend sweep):', mailErr && mailErr.message);
      }
    }

    return json(200, {
      ok: true,
      sheet,
      tab,
      email_queued: emailQueued,
      columns: headersForRow.length,
      updated_range: appendResult.updatedRange || '',
      updated_rows: appendResult.updatedRows || 1,
      spreadsheet_id: spreadsheetID
    }, {}, origin);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return json(statusCode, { ok: false, error: error.message || 'Unable to submit form.' }, {}, origin);
  }
}

module.exports = {
  handleSubmission,
  // Reused by gio-open-handler.cjs for the click log:
  getAccessToken, ensureSheet, readHeaders, headerUnion, writeHeaders, appendRow, boldHeader,
  env, clientIP, requestHeader
};
