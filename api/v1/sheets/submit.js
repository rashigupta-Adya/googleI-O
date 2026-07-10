const { handleSubmission } = require('../../../serverless/sheets-submit-handler.cjs');

module.exports = async function submitToSheets(req, res) {
  const result = await handleSubmission({
    method: req.method,
    headers: req.headers,
    body: req.body && typeof req.body === 'object' ? req.body : req.body || ''
  });

  res.status(result.statusCode || 500);
  for (const [key, value] of Object.entries(result.headers || {})) {
    res.setHeader(key, value);
  }
  res.send(result.body || '{}');
};
