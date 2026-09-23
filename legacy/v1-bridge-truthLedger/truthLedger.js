'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

fs.mkdirSync(path.dirname(config.LEDGER.archPath), { recursive: true });
fs.mkdirSync(path.dirname(config.LEDGER.eventPath), { recursive: true });

function fmt(category, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length > 0 ? '  ' + JSON.stringify(meta) : '';
  return `${ts}  [${category.padEnd(5)}]  ${message}${metaStr}\n`;
}
function append(file, line) {
  try { fs.appendFileSync(file, line); }
  catch (err) { console.error('[truthLedger] write failed:', err.message); }
  process.stdout.write(line);
}
function logArchitecture(changeSummary, details) {
  append(config.LEDGER.archPath, fmt('ARCH', changeSummary, details));
}
function logEvent(eventType, message, metadata) {
  append(config.LEDGER.eventPath, fmt('EVENT', `${eventType}: ${message}`, metadata));
}
module.exports = { logArchitecture, logEvent };
