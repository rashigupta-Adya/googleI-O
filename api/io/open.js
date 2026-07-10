const { handleOpen } = require('../../serverless/gio-open-handler.cjs');

module.exports = async (req, res) => {
  const result = await handleOpen({
    method: req.method,
    headers: req.headers,
    query: req.query || {}
  });
  res.status(result.statusCode || 302);
  for (const [k, v] of Object.entries(result.headers || {})) res.setHeader(k, v);
  res.send(result.body || '');
};
