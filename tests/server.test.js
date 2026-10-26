const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_ALLOWED_ORIGINS, allowedOrigins, buildBreakdownRequest, buildChatRequest, createAppServer, createRateLimiter, liveConfig, normalizeCoachOutput, validateCoachPayload } = require('../server.js');

async function serveOnce(t, options) {
  const server = createAppServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function mockResponse() {
  const headers = {};
  const response = { headers, status: 0, body: '' };
  response.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
  response.writeHead = status => { response.status = status; };
  response.end = data => { response.body = data || ''; };
  return response;
}

test('coach input is bounded and context is reduced to known typed fields', () => {
  const result = validateCoachPayload({
    message: '  Help me get started  ',
    context: { challenge: 'starting', attempted: ['tiny-start', 'bad value', ...Array(8).fill('setup-first')], preferred: 'small-start', taskList: ['private assignment'] }
  });
  assert.deepEqual(result, { value: { message: 'Help me get started', context: { challenge: 'starting', attempted: ['tiny-start', ...Array(4).fill('setup-first')], preferred: 'small-start' } } });
  assert.ok(validateCoachPayload({ message: 'x'.repeat(501) }).error);
  assert.ok(validateCoachPayload({ message: ' ' }).error);
  assert.ok(validateCoachPayload(null).error);
});

test('live AI needs an OpenRouter key and defaults to the free model router', () => {
  assert.equal(liveConfig({ AI_ENABLED: 'true' }).enabled, false);
  assert.equal(liveConfig({ AI_ENABLED: 'false', OPENROUTER_API_KEY: 'secret' }).enabled, false);
  assert.deepEqual(liveConfig({ AI_ENABLED: 'true', OPENROUTER_API_KEY: 'secret' }), { enabled: true, apiKey: 'secret', model: 'openrouter/free' });
  assert.equal(liveConfig({ AI_ENABLED: 'true', OPENROUTER_API_KEY: 'secret', OPENROUTER_MODEL: 'google/gemma-4-31b-it:free' }).model, 'google/gemma-4-31b-it:free');
});

test('OpenRouter request sends one current message and asks for a strict JSON schema', () => {
  const request = buildChatRequest('What should I start?', { challenge: 'starting', attempted: ['tiny-start'], preferred: '' }, 'openrouter/free');
  assert.equal(request.model, 'openrouter/free');
  assert.equal(request.stream, undefined);
  assert.equal(request.messages.length, 2);
  assert.equal(request.messages[0].role, 'system');
  assert.match(request.messages[1].content, /What should I start/);
  assert.match(request.messages[1].content, /starting/);
  assert.doesNotMatch(request.messages[1].content, /taskList|previous messages/i);
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.provider.require_parameters, true);
  assert.deepEqual(request.reasoning, { enabled: false });
  assert.deepEqual(request.plugins, [{ id: 'response-healing' }]);
});

test('assignment requests disable reasoning and still ask OpenRouter to parse the PDF', () => {
  const request = buildBreakdownRequest({ filename: 'essay.pdf', fileData: 'JVBERi0xLjQK' }, 'openrouter/free');
  assert.deepEqual(request.reasoning, { enabled: false });
  assert.deepEqual(request.plugins, [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }, { id: 'response-healing' }]);
  assert.equal(request.provider.require_parameters, true);
  assert.match(request.messages[1].content[0].file.file_data, /^data:application\/pdf;base64,/);
});

test('coach response normalization bounds output and rejects unapproved resource ids', () => {
  const result = normalizeCoachOutput(JSON.stringify({
    reply: 'Try one small step.', action: 'Open the assignment.', strategy: 'tiny-start', detail: 'Optional detail.', resourceId: 'unexpected-link', choices: []
  }));
  assert.equal(result.text, 'Try one small step.');
  assert.equal(result.proposal.action, 'Open the assignment.');
  assert.equal(result.proposal.resourceId, '');
  assert.throws(() => normalizeCoachOutput('not json'));
});

test('in-memory limiter allows a fixed number of requests within its time window', () => {
  let now = 100;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
  assert.equal(limiter('student'), true);
  assert.equal(limiter('student'), true);
  assert.equal(limiter('student'), false);
  now += 1001;
  assert.equal(limiter('student'), true);
});

test('browser origins default to the Pages site, custom domain, and local development', () => {
  assert.deepEqual([...allowedOrigins({})], DEFAULT_ALLOWED_ORIGINS);
  assert.deepEqual([...allowedOrigins({ ALLOWED_ORIGINS: 'https://example.com/, https://foo.test' })], ['https://example.com', 'https://foo.test']);
});

test('cross-origin preflight and health requests allow the frontend origin', async t => {
  const base = await serveOnce(t, { env: {} });
  const preflight = await fetch(`${base}/api/coach`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://daylightt.me',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type'
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://daylightt.me');
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');

  const health = await fetch(`${base}/api/health`, { headers: { origin: 'https://verityhoangjacob67.github.io' } });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('access-control-allow-origin'), 'https://verityhoangjacob67.github.io');
  assert.equal((await health.json()).mode, 'preview');

  const sameOrigin = await fetch(`${base}/api/health`, { headers: { origin: base } });
  assert.equal(sameOrigin.status, 200);
  assert.equal(sameOrigin.headers.get('access-control-allow-origin'), base);

  const blocked = await fetch(`${base}/api/health`, { headers: { origin: 'https://example.com' } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
});

test('Vercel handlers reuse the shared CORS and validation logic', async () => {
  const health = require('../api/health.js');
  const healthResponse = mockResponse();
  await health({ method: 'GET', headers: { origin: 'https://daylightt.me' } }, healthResponse);
  assert.equal(healthResponse.status, 200);
  assert.equal(healthResponse.headers['access-control-allow-origin'], 'https://daylightt.me');
  assert.ok(['preview', 'live'].includes(JSON.parse(healthResponse.body).mode));

  const coach = require('../api/coach.js');
  const coachResponse = mockResponse();
  await coach({ method: 'POST', headers: { origin: 'https://daylightt.me' }, body: { message: '   ' } }, coachResponse);
  assert.equal(coachResponse.status, 400);
  assert.match(JSON.parse(coachResponse.body).error, /Message must be between/);
});

test('Vercel coach handler forwards a valid request to OpenRouter', async () => {
  const previousEnv = { AI_ENABLED: process.env.AI_ENABLED, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL: process.env.OPENROUTER_MODEL };
  const originalFetch = global.fetch;
  process.env.AI_ENABLED = 'true';
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MODEL = 'openrouter/free';
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Open the document.', action: '', strategy: '', detail: '', resourceId: '', choices: [] }) } }] }) };
  };
  try {
    const coach = require('../api/coach.js');
    const response = mockResponse();
    await coach({ method: 'POST', headers: { origin: 'https://daylightt.me' }, body: { message: 'Help me begin', context: { challenge: 'starting' } } }, response);
    assert.equal(response.status, 200);
    assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(response.headers['access-control-allow-origin'], 'https://daylightt.me');
    assert.deepEqual(JSON.parse(response.body), { text: 'Open the document.', choices: [] });
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('HTTP server serves app shell and reports preview mode without a configured key', async t => {
  const base = await serveOnce(t, { env: {} });
  const [page, health] = await Promise.all([fetch(base), fetch(`${base}/api/health`)]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Daylight/);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' https:\/\/www\.gstatic\.com/);
  assert.match(csp, /connect-src 'self' https:\/\/\*\.googleapis\.com https:\/\/\*\.firebaseapp\.com https:\/\/\*\.vercel\.app/);
  assert.match(csp, /frame-src 'self' https:\/\/\*\.firebaseapp\.com/);
  assert.deepEqual(await health.json(), { mode: 'preview' });
  assert.equal((await fetch(`${base}/server.js`)).status, 404);
  const apiConfig = await fetch(`${base}/api-config.js`);
  assert.equal(apiConfig.status, 200);
  assert.match(await apiConfig.text(), /DAYLIGHT_API_BASE/);
  const adapt = await fetch(`${base}/adapt.css`);
  assert.equal(adapt.status, 200);
  assert.match(adapt.headers.get('content-type'), /text\/css/);
});

test('live coach endpoint forwards one validated request and returns normalized output', async t => {
  let captured;
  const base = await serveOnce(t, {
    env: { AI_ENABLED: 'true', OPENROUTER_API_KEY: 'server-secret' },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Open the document.', action: 'Open the document.', strategy: 'tiny-start', detail: 'Only that first step.', resourceId: 'cdc-classroom', choices: [] }) } }] }) };
    }
  });
  const response = await fetch(`${base}/api/coach`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Help me begin', context: { challenge: 'starting', attempted: [], preferred: '' } })
  });
  assert.equal(response.status, 200);
  assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.match(captured.options.headers.authorization, /server-secret/);
  assert.equal(JSON.parse(captured.options.body).model, 'openrouter/free');
  assert.deepEqual(await response.json(), { text: 'Open the document.', proposal: { action: 'Open the document.', strategy: 'tiny-start', detail: 'Only that first step.', resourceId: 'cdc-classroom' }, choices: [] });
});

function liveEnv() {
  return { AI_ENABLED: 'true', OPENROUTER_API_KEY: 'server-secret' };
}

function coachBody(content) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}

const coachReplyJson = JSON.stringify({ reply: 'Open the document.', action: '', strategy: '', detail: '', resourceId: '', choices: [] });

test('a failed free route is retried once and the second attempt answers', async t => {
  let calls = 0;
  const base = await serveOnce(t, {
    env: liveEnv(),
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503, text: async () => '{"error":{"message":"No endpoints available"}}' };
      return coachBody(coachReplyJson);
    }
  });
  const response = await fetch(`${base}/api/coach`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Help me begin', context: { challenge: 'starting' } })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, 'Open the document.');
  assert.equal(calls, 2);
});

test('unusable model output is retried instead of failing the student', async t => {
  let calls = 0;
  const base = await serveOnce(t, {
    env: liveEnv(),
    fetchImpl: async () => {
      calls++;
      const content = calls === 1 ? 'Here are some steps, in plain prose.' : JSON.stringify({ title: 'Lab report', subject: 'Chemistry', steps: ['Open the lab document'] });
      return coachBody(content);
    }
  });
  const response = await fetch(`${base}/api/assignment-breakdown`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: 'lab.pdf', fileData: 'JVBERi0xLjQK' })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { title: 'Lab report', subject: 'Chemistry', steps: ['Open the lab document'] });
  assert.equal(calls, 2);
});

test('a key or account failure is reported with its status and not retried', async t => {
  let calls = 0;
  const base = await serveOnce(t, {
    env: liveEnv(),
    fetchImpl: async () => { calls++; return { ok: false, status: 401, text: async () => '{"error":{"message":"Missing Authentication header"}}' }; }
  });
  const response = await fetch(`${base}/api/coach`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Help me begin', context: { challenge: 'starting' } })
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).upstreamStatus, 401);
  assert.equal(calls, 1);
});
