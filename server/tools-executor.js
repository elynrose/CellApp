/**
 * Server-side execution for user-configured integrations (Tavily, email, Telegram, Twilio).
 * Keys are read from Firestore users/{uid}.integrationSecrets (never returned to client).
 */

const https = require('https');
const { URL } = require('url');

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode, body: parsed, raw: data });
          } catch {
            resolve({ status: res.statusCode, body: data, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function tavilySearch(args, secrets) {
  const key = secrets.tavilyApiKey;
  if (!key || !String(key).trim()) {
    return { ok: false, error: 'Tavily API key not configured in profile integrations.' };
  }
  const query = args.query || args.q || args.search;
  if (!query || typeof query !== 'string') {
    return { ok: false, error: 'Missing query for tavily_search' };
  }
  const body = JSON.stringify({
    api_key: key,
    query: query.trim(),
    search_depth: args.search_depth || 'basic',
    max_results: Math.min(Number(args.max_results) || 5, 10)
  });
  const res = await fetchJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    body
  });
  if (res.status >= 200 && res.status < 300) {
    return { ok: true, data: res.body };
  }
  return { ok: false, error: typeof res.body === 'object' ? JSON.stringify(res.body) : String(res.raw || res.status) };
}

async function telegramSend(args, secrets) {
  const token = secrets.telegramBotToken;
  if (!token || !String(token).trim()) {
    return { ok: false, error: 'Telegram bot token not configured.' };
  }
  const chatId = args.chat_id || args.chatId || secrets.telegramDefaultChatId;
  const text = args.text || args.message || args.body;
  if (!chatId) {
    return { ok: false, error: 'Missing chat_id (set default in integrations or pass in tool args).' };
  }
  if (!text || typeof text !== 'string') {
    return { ok: false, error: 'Missing text for telegram_send_message' };
  }
  const path = `/bot${encodeURIComponent(token)}/sendMessage`;
  const payload = JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4090) });
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            resolve(j.ok ? { ok: true, data: j } : { ok: false, error: j.description || data });
          } catch {
            resolve({ ok: false, error: data || res.statusCode });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(payload);
    req.end();
  });
}

async function twilioSms(args, secrets) {
  const sid = secrets.twilioAccountSid;
  const token = secrets.twilioAuthToken;
  const from = secrets.twilioFromNumber;
  if (!sid || !token || !from) {
    return { ok: false, error: 'Twilio Account SID, Auth Token, and From number required in integrations.' };
  }
  const to = args.to || args.phone;
  const body = args.body || args.text || args.message;
  if (!to || !body) {
    return { ok: false, error: 'twilio_send_sms requires to and body' };
  }
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams();
  form.append('To', to);
  form.append('From', from);
  form.append('Body', String(body).slice(0, 1600));
  const path = `/2010-04-01/Accounts/${sid}/Messages.json`;
  const payload = form.toString();
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.twilio.com',
        path,
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.sid) resolve({ ok: true, data: { sid: j.sid, status: j.status } });
            else resolve({ ok: false, error: j.message || data });
          } catch {
            resolve({ ok: false, error: data });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(payload);
    req.end();
  });
}

async function sendEmail(args, secrets) {
  const to = args.to || args.recipient;
  const subject = args.subject || '(no subject)';
  const text = args.text || args.body || '';
  const html = args.html;
  if (!to) {
    return { ok: false, error: 'send_email requires to' };
  }

  if (secrets.sendgridApiKey && String(secrets.sendgridApiKey).trim()) {
    const from = args.from || secrets.emailFrom || secrets.smtpFrom;
    if (!from) {
      return { ok: false, error: 'Set emailFrom in integrations or pass from in tool args.' };
    }
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: []
    };
    if (html) payload.content.push({ type: 'text/html', value: html });
    if (text) payload.content.push({ type: 'text/plain', value: text });
    if (!payload.content.length) payload.content.push({ type: 'text/plain', value: '' });

    const body = JSON.stringify(payload);
    const res = await fetchJson('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secrets.sendgridApiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, data: { provider: 'sendgrid', status: res.status } };
    }
    return { ok: false, error: res.raw || String(res.status) };
  }

  if (secrets.smtpHost && secrets.smtpUser && secrets.smtpPass) {
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch {
      return { ok: false, error: 'SMTP requires nodemailer package on server.' };
    }
    const port = Number(secrets.smtpPort) || 587;
    const transporter = nodemailer.createTransport({
      host: secrets.smtpHost,
      port,
      secure: port === 465,
      auth: { user: secrets.smtpUser, pass: secrets.smtpPass }
    });
    const from = args.from || secrets.smtpFrom || secrets.emailFrom || secrets.smtpUser;
    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text: text || undefined,
        html: html || undefined
      });
      return { ok: true, data: { provider: 'smtp', messageId: info.messageId } };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return { ok: false, error: 'Configure SendGrid API key or SMTP settings in profile integrations.' };
}

/**
 * @param {string} tool
 * @param {object} args
 * @param {object} secrets - integrationSecrets from Firestore
 */
async function executeTool(tool, args, secrets) {
  const t = String(tool || '').toLowerCase().replace(/-/g, '_');
  switch (t) {
    case 'tavily_search':
    case 'research':
    case 'web_search':
      return tavilySearch(args || {}, secrets);
    case 'telegram_send_message':
    case 'telegram':
      return telegramSend(args || {}, secrets);
    case 'twilio_send_sms':
    case 'sms':
    case 'send_sms':
      return twilioSms(args || {}, secrets);
    case 'send_email':
    case 'email':
      return sendEmail(args || {}, secrets);
    default:
      return { ok: false, error: `Unknown tool: ${tool}` };
  }
}

module.exports = { executeTool };
