const { MAX_PDF_BODY_BYTES, applyCors, assignmentBreakdown, isOriginAllowed, readJson, sendJson } = require('../server.js');

module.exports = async (req, res) => {
  applyCors(req, res, process.env, 'https');
  if (!isOriginAllowed(req, process.env, 'https')) return sendJson(res, 403, { error: 'Origin not allowed.' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });

  let body;
  try { body = await readJson(req, MAX_PDF_BODY_BYTES); } catch (error) { return sendJson(res, error.status || 400, { error: error.status ? error.message : 'The PDF could not be read.' }); }
  const result = await assignmentBreakdown(body);
  return sendJson(res, result.status, result.body);
};
