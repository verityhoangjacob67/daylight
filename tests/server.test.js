const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResponsesRequest, createAppServer, createRateLimiter, liveConfig, normalizeCoachOutput, validateCoachPayload } = require('../server.js');

async function serveOnce(t, options) {
  const server = createAppServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
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

test('live AI is unavailable unless explicitly enabled with both server credentials and model', () => {
  assert.equal(liveConfig({ AI_ENABLED: 'true', OPENAI_API_KEY: 'secret' }).enabled, false);
  assert.equal(liveConfig({ AI_ENABLED: 'false', OPENAI_API_KEY: 'secret', OPENAI_MODEL: 'gpt-4.1-mini' }).enabled, false);
  assert.equal(liveConfig({ AI_ENABLED: 'true', OPENAI_API_KEY: 'secret', OPENAI_MODEL: 'gpt-4.1-mini' }).enabled, true);
});

test('Responses API request uses one current message and disables stored response state', () => {
  const request = buildResponsesRequest('What should I start?', { challenge: 'starting', attempted: ['tiny-start'], preferred: '' }, 'gpt-4.1-mini');
  assert.equal(request.model, 'gpt-4.1-mini');
  assert.equal(request.store, false);
  assert.equal(request.input.length, 1);
  const text = request.input[0].content[0].text;
  assert.match(text, /What should I start/);
  assert.match(text, /starting/);
  assert.doesNotMatch(text, /taskList|previous messages/i);
  assert.equal(request.text.format.type, 'json_schema');
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

test('HTTP server serves app shell and reports preview mode without a configured key', async t => {
  const base = await serveOnce(t, { env: {} });
  const [page, health] = await Promise.all([fetch(base), fetch(`${base}/api/health`)]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Daylight/);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' https:\/\/www\.gstatic\.com/);
  assert.match(csp, /connect-src 'self' https:\/\/\*\.googleapis\.com https:\/\/\*\.firebaseapp\.com/);
  assert.match(csp, /frame-src 'self' https:\/\/\*\.firebaseapp\.com/);
  assert.deepEqual(await health.json(), { mode: 'preview' });
  assert.equal((await fetch(`${base}/server.js`)).status, 404);
  const adapt = await fetch(`${base}/adapt.css`);
  assert.equal(adapt.status, 200);
  assert.match(adapt.headers.get('content-type'), /text\/css/);
});

test('live coach endpoint forwards one validated request and returns normalized output', async t => {
  let captured;
  const base = await serveOnce(t, {
    env: { AI_ENABLED: 'true', OPENAI_API_KEY: 'server-secret', OPENAI_MODEL: 'gpt-4.1-mini' },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ reply: 'Open the document.', action: 'Open the document.', strategy: 'tiny-start', detail: 'Only that first step.', resourceId: 'cdc-classroom', choices: [] }) }) };
    }
  });
  const response = await fetch(`${base}/api/coach`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Help me begin', context: { challenge: 'starting', attempted: [], preferred: '' } })
  });
  assert.equal(response.status, 200);
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.match(captured.options.headers.authorization, /server-secret/);
  assert.equal(JSON.parse(captured.options.body).store, false);
  assert.deepEqual(await response.json(), { text: 'Open the document.', proposal: { action: 'Open the document.', strategy: 'tiny-start', detail: 'Only that first step.', resourceId: 'cdc-classroom' }, choices: [] });
});
