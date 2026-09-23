'use strict';

const express = require('express');
const config = require('./config');
const { logArchitecture, logEvent } = require('./truthLedger');
const { syncCookieTo } = require('./cookieManager');
const sseRouter = require('./sseRouter');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    logEvent('HTTP', `${req.method} ${req.path}`, {
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  next();
});

app.use('/api/bridge', sseRouter);

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: Math.floor(process.uptime()) });
});

app.use((err, req, res, _next) => {
  logEvent('ERROR', 'unhandled express error', { path: req.path, error: err.message });
  res.status(500).json({ ok: false, error: 'internal_error', message: err.message });
});

logArchitecture(
  'Bridge server starting — Express + SSE + Truth Ledger + Cookie sync',
  {
    port: config.BRIDGE_PORT,
    aiBaseUrl: config.AI.baseUrl,
    aiModel: config.AI.defaultModel,
    cookieSource: config.COOKIE.sourcePath,
    ledgerArch: config.LEDGER.archPath,
    ledgerEvent: config.LEDGER.eventPath,
  }
);

try { syncCookieTo(); } catch (err) {
  logEvent('COOKIE_SYNC', 'initial sync failed (non-fatal)', { error: err.message });
}

const server = app.listen(config.BRIDGE_PORT, config.BRIDGE_HOST, () => {
  logEvent('STARTUP', 'bridge listening', {
    host: config.BRIDGE_HOST,
    port: config.BRIDGE_PORT,
  });
  console.log(`\n[bridge] http://${config.BRIDGE_HOST}:${config.BRIDGE_PORT}\n`);
});

function shutdown(signal) {
  logEvent('SHUTDOWN', `received ${signal}`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
