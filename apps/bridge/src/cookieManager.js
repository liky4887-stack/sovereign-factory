'use strict';

const fs = require('fs');
const path = require('path');
const { logEvent } = require('./truthLedger');
const config = require('./config');

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

function loadCookie() {
  const src = config.COOKIE.sourcePath;
  try {
    const parsed = JSON.parse(fs.readFileSync(src, 'utf8'));
    logEvent('COOKIE_LOAD', 'source cookie file read', { path: src, keys: Object.keys(parsed).length });
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      logEvent('COOKIE_LOAD', 'source cookie file not found, using empty', { path: src });
      return {};
    }
    logEvent('COOKIE_LOAD', 'failed to parse cookie file', { path: src, error: err.message });
    throw err;
  }
}

function saveCookie(obj) {
  const src = config.COOKIE.sourcePath;
  ensureDir(src);
  const tmp = `${src}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, src);
  logEvent('COOKIE_SAVE', 'source cookie file updated', { path: src, keys: Object.keys(obj).length });
}

function syncCookieTo(targetPath = config.COOKIE.workingPath) {
  ensureDir(targetPath);
  try {
    fs.copyFileSync(config.COOKIE.sourcePath, targetPath);
    logEvent('COOKIE_SYNC', 'cookie file copied to working path', { from: config.COOKIE.sourcePath, to: targetPath });
    return targetPath;
  } catch (err) {
    logEvent('COOKIE_SYNC', 'sync failed', { error: err.message });
    throw err;
  }
}

function toCookieHeader(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('; ');
}

module.exports = { loadCookie, saveCookie, syncCookieTo, toCookieHeader };
