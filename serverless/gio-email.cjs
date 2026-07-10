/* =========================================================
   E1 "Welcome" transactional email for the gio signup.
   Sent via Resend (https://resend.com) with plain fetch — no SDK,
   no npm dependency, matching the repo's zero-dependency style.
   Content is verbatim from GIO_Connect_Launch_SOP.md section 7.2.
   Only the bracketed per-platform blocks differ across Vanij / GTM / RAS.
   ========================================================= */

function env(name, fallback) {
  var v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

var PLATFORMS = {
  vanij: {
    name: 'Vanij',
    accent: '#6B4EE6', // violet (SAI family), darkened for white-bg contrast
    subject: 'Your Vanij access is ready (open on desktop)',
    prerequisites: [
      'A laptop. Chrome, Edge, Safari or Firefox, screen 1280px or wider.',
      'Twenty minutes without a meeting.',
      'One idea for something you want built. A tool, an internal app, a workflow. It does not have to be big. It has to be real.',
      'Optional but useful: a policy document, an SOP, or a compliance doc from your organisation. AGP will read it and turn it into executable governance. This is the moment most people understand what Vanij actually is.'
    ],
    quickstart: [
      ['Talk to SAI.', 'SAI is the orchestration layer. You describe what you want in plain language. It asks you questions back. Do not try to write a spec. Have a conversation.'],
      ['Watch it produce a PRD and an architecture.', 'Read them. Correct them. This is the step people skip and then regret.'],
      ['Drop in your policy document.', 'Watch AGP translate it into rules that get proved before any agent is allowed to run. This is the part nobody else has.'],
      ['Let the build loop run.', 'The coding agent spawns subagents. You will see them coordinate.'],
      ['Ship it.', 'Deploy to your cloud, or ours.']
    ],
    closer: 'Then run the same task a second time. It will be faster and cheaper, because ESM remembered the first run. That second run is the whole argument.',
    teamPrompt: 'Building with a team? Reply with "team" and we will set up a shared workspace.'
  },
  gtm: {
    name: 'GTM Agent',
    accent: '#1391BE', // cyan (GTM family), darkened for white-bg contrast
    subject: 'Your GTM Agent access is ready (open on desktop)',
    prerequisites: [
      'A laptop. Chrome, Edge, Safari or Firefox, screen 1280px or wider.',
      'Twenty minutes.',
      'Your ICP in one sentence. Who you sell to. If you cannot write it in one sentence, that is your first finding.',
      'A list of 20 target accounts. A CSV, a LinkedIn search, or just names typed in.',
      'Optional: read access to your CRM. You do not need this to see the product work, but it is where it gets interesting.'
    ],
    quickstart: [
      ['Define the ICP.', 'One sentence. The agent will push back on it, which is the point.'],
      ['Load 20 accounts.', 'Paste them in. It will enrich them.'],
      ['Ask for a campaign.', 'Say what you want. "Book meetings with heads of engineering at these accounts." Do not specify channel.'],
      ['Read what it drafted before you send anything.', 'Email, LinkedIn, WhatsApp, call scripts. Every account, worked in parallel. This is where you find out whether the personalisation is real.'],
      ['Turn one campaign on.', 'Twenty accounts, not two thousand. Watch the sales co-pilot qualify replies.']
    ],
    closer: 'The number that matters is not volume. It is cost per qualified lead, and you will see it on the dashboard from run one.',
    teamPrompt: 'Rolling this out to an SDR or marketing team? Reply with "team" and we will map it to your funnel.'
  },
  ras: {
    name: 'RAS',
    accent: '#5B6BFF', // indigo (ESA family)
    subject: 'Your RAS access is ready (open on desktop)',
    prerequisites: [
      'A laptop. Chrome, Edge, Safari or Firefox, screen 1280px or wider.',
      'Twenty minutes.',
      'One real decision you are facing. Not a test question. A decision where you would genuinely like a second opinion.',
      'Optional: a few documents from your company wiki, a board deck, a competitor teardown. RAS is far more interesting when it is reading your material rather than the public internet.'
    ],
    quickstart: [
      ['Ask your real question.', '"Should we enter the US mid-market in Q1?" Not "tell me about the market."'],
      ['Watch the four roles work.', 'Researcher gathers. Analyst structures. Strategist frames options. Then you get an executive recommendation.'],
      ['Open the reasoning trail.', 'Every step is recorded and replayable. Follow one conclusion back to its source. This is the difference between an answer and a decision you can defend to a board.'],
      ['Disagree with it.', 'Tell it what it got wrong. Run it again. ESM remembers.'],
      ['Upload one internal document', 'and ask the same question. Compare the two answers.']
    ],
    closer: '',
    teamPrompt: 'Want your strategy or leadership team on this? Reply with "team" and we will set up a shared knowledge base.'
  }
};

function normalizePlatform(p) {
  var v = String(p || '').trim().toLowerCase();
  return PLATFORMS[v] ? v : 'vanij';
}

function firstName(name) {
  var n = String(name || '').trim();
  return n ? n.split(/\s+/)[0] : 'there';
}

function resolveOrigin(origin) {
  return String(origin || env('SITE_ORIGIN', 'https://adya.ai')).replace(/\/+$/, '');
}

function openUrl(platform, leadId, origin) {
  return resolveOrigin(origin) + '/api/io/open?p=' + encodeURIComponent(platform) + (leadId ? '&lead=' + encodeURIComponent(leadId) : '');
}

function renderEmailHTML(platform, name, url, origin) {
  var p = PLATFORMS[platform];
  var accent = p.accent;
  var preheader = 'Open this one on your laptop. Here is your link and a 5-minute start.';

  var pre = p.prerequisites.map(function (t) {
    return '<tr><td style="padding:2px 0 2px 0;vertical-align:top;color:' + accent + ';font-weight:700;">&bull;&nbsp;</td><td style="padding:2px 0;color:#3a3f4b;font-size:15px;line-height:1.5;">' + esc(t) + '</td></tr>';
  }).join('');

  var qs = p.quickstart.map(function (row, i) {
    return '<tr><td style="padding:6px 10px 6px 0;vertical-align:top;color:' + accent + ';font-weight:700;font-size:15px;">' + (i + 1) + '.</td>' +
      '<td style="padding:6px 0;color:#3a3f4b;font-size:15px;line-height:1.5;"><strong style="color:#14161f;">' + esc(row[0]) + '</strong> ' + esc(row[1]) + '</td></tr>';
  }).join('');

  var closer = p.closer ? '<p style="margin:16px 0 0;color:#3a3f4b;font-size:15px;line-height:1.6;">' + esc(p.closer) + '</p>' : '';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>' +
    '<body style="margin:0;padding:0;background:#f4f5f7;">' +
    '<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f5f7;">' + esc(preheader) + '</span>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8ec;">' +
    '<tr><td style="padding:22px 28px;border-bottom:1px solid #eef0f3;"><span style="font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:19px;letter-spacing:-0.02em;color:#14161f;">Adya</span></td></tr>' +
    '<tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;">' +
    '<p style="margin:0 0 14px;color:#14161f;font-size:16px;">Hi ' + esc(firstName(name)) + ',</p>' +
    '<p style="margin:0 0 14px;color:#3a3f4b;font-size:15px;line-height:1.6;">Thanks for scanning at Google I/O Connect. You now have access to <strong style="color:#14161f;">' + esc(p.name) + '</strong>.</p>' +
    '<p style="margin:0 0 6px;color:#14161f;font-size:15px;font-weight:700;">One thing before you click.</p>' +
    '<p style="margin:0 0 18px;color:#3a3f4b;font-size:15px;line-height:1.6;"><strong style="color:#14161f;">' + esc(p.name) + ' runs on desktop.</strong> It is a full workspace, not a phone app. Open this email on your laptop when you have twenty minutes, then click the button below. Your link works for the next 7 days.</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border-radius:999px;background:' + accent + ';"><a href="' + esc(url) + '" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Open ' + esc(p.name) + ' &rarr;</a></td></tr></table>' +
    '<p style="margin:0 0 8px;color:#8a909c;font-size:13px;line-height:1.5;">If you are reading this on your phone right now, that is fine. Star the email and come back to it.</p>' +
    '<hr style="border:none;border-top:1px solid #eef0f3;margin:22px 0;">' +
    '<p style="margin:0 0 10px;color:#14161f;font-size:15px;font-weight:700;">What you will need</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%">' + pre + '</table>' +
    '<hr style="border:none;border-top:1px solid #eef0f3;margin:22px 0;">' +
    '<p style="margin:0 0 10px;color:#14161f;font-size:15px;font-weight:700;">Your first twenty minutes</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%">' + qs + '</table>' + closer +
    '<hr style="border:none;border-top:1px solid #eef0f3;margin:22px 0;">' +
    '<p style="margin:0 0 10px;color:#14161f;font-size:15px;font-weight:700;">Where to go when you get stuck</p>' +
    '<p style="margin:0 0 4px;color:#3a3f4b;font-size:15px;line-height:1.6;">Docs: <a href="https://adya.ai/docs" style="color:' + accent + ';">adya.ai/docs</a></p>' +
    '<p style="margin:0 0 16px;color:#3a3f4b;font-size:15px;line-height:1.6;">Reply to this email. A person reads it.</p>' +
    '<p style="margin:0 0 18px;color:#3a3f4b;font-size:15px;line-height:1.6;">' + esc(p.teamPrompt) + '</p>' +
    '<p style="margin:0;color:#14161f;font-size:15px;">Shayak<br><span style="color:#8a909c;">Co-founder, Adya</span></p>' +
    '</td></tr>' +
    '<tr><td style="padding:18px 28px;border-top:1px solid #eef0f3;color:#9aa0ac;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;">You are receiving this because you signed up for ' + esc(p.name) + ' at Google I/O Connect India 2026. <a href="' + esc(resolveOrigin(origin)) + '/privacy/" style="color:#9aa0ac;">Privacy</a> &middot; <a href="mailto:' + esc(env('RESEND_REPLY_TO', 'hello@adya.ai')) + '?subject=unsubscribe" style="color:#9aa0ac;">Unsubscribe</a></td></tr>' +
    '</table></td></tr></table></body></html>';
}

function renderEmailText(platform, name, url) {
  var p = PLATFORMS[platform];
  var lines = [];
  lines.push('Hi ' + firstName(name) + ',');
  lines.push('');
  lines.push('Thanks for scanning at Google I/O Connect. You now have access to ' + p.name + '.');
  lines.push('');
  lines.push('One thing before you click.');
  lines.push(p.name + ' runs on desktop. It is a full workspace, not a phone app. Open this email on your laptop when you have twenty minutes, then open the link below. Your link works for the next 7 days.');
  lines.push('');
  lines.push('Open ' + p.name + ': ' + url);
  lines.push('');
  lines.push('If you are reading this on your phone right now, that is fine. Star the email and come back to it.');
  lines.push('');
  lines.push('WHAT YOU WILL NEED');
  p.prerequisites.forEach(function (t) { lines.push('- ' + t); });
  lines.push('');
  lines.push('YOUR FIRST TWENTY MINUTES');
  p.quickstart.forEach(function (row, i) { lines.push((i + 1) + '. ' + row[0] + ' ' + row[1]); });
  if (p.closer) { lines.push(''); lines.push(p.closer); }
  lines.push('');
  lines.push('WHERE TO GO WHEN YOU GET STUCK');
  lines.push('Docs: adya.ai/docs');
  lines.push('Reply to this email. A person reads it.');
  lines.push('');
  lines.push(p.teamPrompt);
  lines.push('');
  lines.push('Shayak, Co-founder, Adya');
  return lines.join('\n');
}

async function sendGioEmail(opts) {
  opts = opts || {};
  var platform = normalizePlatform(opts.platform);
  var to = String(opts.email || '').trim();
  if (!to) throw new Error('missing recipient email');

  var apiKey = env('RESEND_API_KEY', '');
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  var p = PLATFORMS[platform];
  var url = openUrl(platform, opts.leadId, opts.siteOrigin);
  var from = env('RESEND_FROM', 'Adya <hello@adya.ai>');
  var replyTo = env('RESEND_REPLY_TO', 'hello@adya.ai');

  var body = {
    from: from,
    to: [to],
    reply_to: replyTo,
    subject: p.subject,
    html: renderEmailHTML(platform, opts.name, url, opts.siteOrigin),
    text: renderEmailText(platform, opts.name, url),
    headers: { 'List-Unsubscribe': '<mailto:' + replyTo + '?subject=unsubscribe>' }
  };

  var resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  var payload = await resp.json().catch(function () { return {}; });
  if (!resp.ok) {
    throw new Error('Resend ' + resp.status + ': ' + (payload && (payload.message || payload.error) || 'send failed'));
  }
  return { id: payload && payload.id, platform: platform };
}

module.exports = { sendGioEmail, openUrl, PLATFORMS, normalizePlatform, renderEmailHTML, renderEmailText };
