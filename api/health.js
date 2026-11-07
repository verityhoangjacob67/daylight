const { applyCors, isOriginAllowed, liveConfig, sendJson } = require('../server.js');

module.exports = async (req, res) => {
  applyCors(req, res, process.env, 'https');
  if (!isOriginAllowed(req, process.env, 'https')) return sendJson(res, 403, { error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  return sendJson(res, 200, { mode: liveConfig(process.env).enabled ? 'live' : 'preview' });
};
