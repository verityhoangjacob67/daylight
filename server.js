const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const MAX_BODY_BYTES = 12 * 1024;
const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const SAFE_RESOURCES = new Set(['cdc-classroom', 'cdc-treatment', 'chadd-organize-teens', 'chadd-homework', 'aap-guideline', 'chadd-peer-support']);
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/features.css', ['features.css', 'text/css; charset=utf-8']],
  ['/dark-mode.css', ['dark-mode.css', 'text/css; charset=utf-8']],
  ['/colorize.css', ['colorize.css', 'text/css; charset=utf-8']],
  ['/typeset.css', ['typeset.css', 'text/css; charset=utf-8']],
  ['/adapt.css', ['adapt.css', 'text/css; charset=utf-8']],
  ['/harden.css', ['harden.css', 'text/css; charset=utf-8']],
  ['/optimize.css', ['optimize.css', 'text/css; charset=utf-8']],
  ['/distill.css', ['distill.css', 'text/css; charset=utf-8']],
  ['/polish.css', ['polish.css', 'text/css; charset=utf-8']],
  ['/auth.css', ['auth.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/resources.js', ['resources.js', 'text/javascript; charset=utf-8']],
  ['/coach-service.js', ['coach-service.js', 'text/javascript; charset=utf-8']],
  ['/firebase-config.js', ['firebase-config.js', 'text/javascript; charset=utf-8']],
  ['/firebase-client.js', ['firebase-client.js', 'text/javascript; charset=utf-8']],
  ['/public/icon.svg', ['public/icon.svg', 'image/svg+xml']]
]);

function loadLocalEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    process.env[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
  }
}

function liveConfig(env = process.env) {
  const enabled = env.AI_ENABLED === 'true' && Boolean(env.OPENAI_API_KEY) && Boolean(env.OPENAI_MODEL);
  return { enabled, apiKey: enabled ? env.OPENAI_API_KEY : '', model: enabled ? env.OPENAI_MODEL : '' };
}

function validateCoachPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Send a message to the coach.' };
  if (typeof value.message !== 'string') return { error: 'Send a message to the coach.' };
  const message = value.message.trim();
  if (!message || message.length > MAX_MESSAGE_LENGTH) return { error: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.` };
  const source = value.context && typeof value.context === 'object' && !Array.isArray(value.context) ? value.context : {};
  const challenge = ['starting', 'overwhelmed', 'distracted', 'returning', 'prioritizing'].includes(source.challenge) ? source.challenge : '';
  const attempted = Array.isArray(source.attempted) ? source.attempted.filter(x => typeof x === 'string' && /^[a-z-]{1,32}$/.test(x)).slice(0, 5) : [];
  const preferred = typeof source.preferred === 'string' && /^[a-z-]{1,32}$/.test(source.preferred) ? source.preferred : '';
  return { value: { message, context: { challenge, attempted, preferred } } };
}

function buildResponsesRequest(message, context, model) {
  const schema = {
    type: 'object', additionalProperties: false,
    properties: {
      reply: { type: 'string' }, action: { type: 'string' }, strategy: { type: 'string' },
      detail: { type: 'string' }, resourceId: { type: 'string', enum: ['', ...SAFE_RESOURCES] },
      choices: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, text: { type: 'string' } }, required: ['label', 'text'] } }
    },
    required: ['reply', 'action', 'strategy', 'detail', 'resourceId', 'choices']
  };
  const coachingContext = [
    context.challenge ? `Current challenge category: ${context.challenge}.` : '',
    context.attempted.length ? `Strategies already tried: ${context.attempted.join(', ')}.` : '',
    context.preferred ? `Student said this strategy helped: ${context.preferred}.` : ''
  ].filter(Boolean).join(' ');
  return {
    model, store: false, max_output_tokens: 320,
    instructions: 'You are Daylight, a supportive schoolwork coach for students. Give one concise, kind, practical next step for starting, organizing, focusing, or returning to schoolwork. Ask one brief question with up to three simple choices only when the message is unclear; when asking, leave action, strategy, detail, and resourceId empty. Otherwise provide one optional, editable action and a short explanation. Never diagnose, give medical advice, imply clinical effectiveness, shame the student, or say productivity determines worth. Do not mention unavailable features. Use plain language. Only select a resourceId from the allowed enum when genuinely useful. The app is a supportive tool, not treatment or a replacement for professional care.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: `${coachingContext ? `Brief coaching context: ${coachingContext}\n` : ''}Current message: ${message}` }] }],
    text: { format: { type: 'json_schema', name: 'daylight_coach_reply', strict: true, schema } }
  };
}

function normalizeCoachOutput(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.reply !== 'string') throw new Error('Invalid coach response');
  const reply = parsed.reply.trim().slice(0, 700);
  if (!reply) throw new Error('Empty coach response');
  const result = { text: reply };
  if (typeof parsed.action === 'string' && parsed.action.trim()) {
    result.proposal = {
      action: parsed.action.trim().slice(0, 160),
      strategy: typeof parsed.strategy === 'string' ? parsed.strategy.slice(0, 48) : 'small-step',
      detail: typeof parsed.detail === 'string' ? parsed.detail.slice(0, 360) : '',
      resourceId: SAFE_RESOURCES.has(parsed.resourceId) ? parsed.resourceId : ''
    };
  }
  if (Array.isArray(parsed.choices)) result.choices = parsed.choices.slice(0, 3).filter(choice => choice && typeof choice.label === 'string' && typeof choice.text === 'string').map(choice => ({ label: choice.label.slice(0, 45), text: choice.text.slice(0, 160) }));
  return result;
}

function createRateLimiter({ limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS, now = Date.now } = {}) {
  const requests = new Map();
  return key => {
    const time = now();
    const valid = (requests.get(key) || []).filter(stamp => time - stamp < windowMs);
    if (valid.length >= limit) { requests.set(key, valid); return false; }
    valid.push(time); requests.set(key, valid);
    if (requests.size > 1000) for (const [ip, stamps] of requests) if (!stamps.some(stamp => time - stamp < windowMs)) requests.delete(ip);
    return true;
  };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let oversized = false;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      if (oversized) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) { oversized = true; body = ''; reject(Object.assign(new Error('Request is too large.'), { status: 413 })); }
    });
    req.on('end', () => {
      if (oversized) return;
      try { resolve(JSON.parse(body)); } catch { reject(Object.assign(new Error('Request must be valid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function outputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  for (const item of response.output || []) for (const part of item.content || []) if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
  return '';
}

function createAppServer({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const allowRequest = createRateLimiter({ now });
  return http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { return sendJson(res, 400, { error: 'Invalid request.' }); }
    if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { mode: liveConfig(env).enabled ? 'live' : 'preview' });
    if (pathname === '/api/coach' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (!allowRequest(ip)) return sendJson(res, 429, { error: 'A short pause, then try again.' });
      let body;
      try { body = await readJson(req); } catch (error) { return sendJson(res, error.status || 400, { error: error.status ? error.message : 'Request could not be read.' }); }
      const validated = validateCoachPayload(body);
      if (validated.error) return sendJson(res, 400, { error: validated.error });
      const config = liveConfig(env);
      if (!config.enabled) return sendJson(res, 503, { error: 'Live AI is not configured. You can keep using local preview.' });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST', signal: controller.signal,
          headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(buildResponsesRequest(validated.value.message, validated.value.context, config.model))
        });
        if (!response.ok) return sendJson(res, 502, { error: 'The live coach is temporarily unavailable. Try again in a moment.' });
        const result = normalizeCoachOutput(outputText(await response.json()));
        return sendJson(res, 200, result);
      } catch {
        return sendJson(res, 502, { error: 'The live coach is temporarily unavailable. Try again in a moment.' });
      } finally { clearTimeout(timeout); }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });
    const file = PUBLIC_FILES.get(pathname);
    if (!file) return sendJson(res, 404, { error: 'Not found.' });
    try {
      const contents = fs.readFileSync(path.join(ROOT, file[0]));
      res.writeHead(200, { 'content-type': file[1], 'content-length': contents.length, 'cache-control': pathname === '/' || pathname === '/index.html' ? 'no-cache' : 'public, max-age=300' });
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch { sendJson(res, 404, { error: 'Not found.' }); }
  });
}

if (require.main === module) {
  loadLocalEnv();
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 4173);
  createAppServer().listen(port, host, () => console.log(`Daylight is available at http://${host}:${port}`));
}

module.exports = { MAX_BODY_BYTES, buildResponsesRequest, createAppServer, createRateLimiter, liveConfig, loadLocalEnv, normalizeCoachOutput, validateCoachPayload };
