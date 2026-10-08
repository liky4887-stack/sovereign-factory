// Proxy /tools/* → http://127.0.0.1:8792/tool/*
// Wire into the running Express server via module side-effect.
const http = require('http');

function proxyTools(req, res) {
  const path = req.url.replace(/^\/tools\//, '/tool/');
  const body = JSON.stringify(req.body || {});
  const r = http.request({
    hostname: '127.0.0.1', port: 8792, path, method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
  }, (up) => {
    let acc = '';
    up.on('data', c => acc += c);
    up.on('end', () => {
      res.statusCode = up.statusCode || 200;
      res.setHeader('content-type', 'application/json');
      res.end(acc);
    });
  });
  r.on('error', (e) => {
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: 'sidecar: ' + e.message }));
  });
  r.write(body); r.end();
}

module.exports = { proxyTools };
