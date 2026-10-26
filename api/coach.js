const { MAX_BODY_BYTES, applyCors, coachReply, isOriginAllowed, readJson, sendJson } = require('../server.js');

function invalidJson() {
  return Object.assign(new Error('Request must be valid JSON.'), { status: 400 });
}

function bodyFromRequest(req) {
  const body = req.body;
  if (body === undefined) return readJson(req);
  if (Buffer.isBuffer(body)) {
    if (body.length > MAX_BODY_BYTES) return Promise.reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
    try { return Promise.resolve(JSON.parse(body.toString('utf8'))); } catch { return Promise.reject(invalidJson()); }
  }
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return Promise.reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
    try { return Promise.resolve(JSON.parse(body)); } catch { return Promise.reject(invalidJson()); }
  }
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) return Promise.reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
  return Promise.resolve(body);
}

module.exports = async (req, res) => {
  applyCors(req, res);
  if (!isOriginAllowed(req)) return sendJson(res, 403, { error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });

  let body;
  try { body = await bodyFromRequest(req); } catch (error) { return sendJson(res, error.status || 400, { error: error.status ? error.message : 'Request could not be read.' }); }
  const result = await coachReply(body);
  return sendJson(res, result.status, result.body);
};
