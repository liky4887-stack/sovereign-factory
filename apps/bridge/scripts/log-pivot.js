// One-shot script: records the auth pivot in the Truth Ledger, then exits.
// Run once. Subsequent changes get logged by the modules themselves.

const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const { logArchitecture, logEvent } = require('../src/truthLedger');

logArchitecture(
  'AUTH PIVOT — Bridge auth strategy changes from API-key to session-cookie',
  {
    previous: 'Authorization: Bearer <DEEPSEEK_API_KEY> against api.deepseek.com',
    current:  'Cookie: <session> loaded from COOKIE_FILE_PATH against chat.deepseek.com web endpoint',
    rationale: 'User directive. Cookies reflect the live browser session; API key is not used.',
    impact:   'config.js, sseRouter.js, .env changed. cookieManager.js unchanged.',
  }
);
logEvent('AUTH', 'auth strategy set to cookie', { source: 'manual pivot' });
logEvent('AUTH', 'API key references removed from config requirements');
console.log('Pivot logged to logs/truth-ledger-architecture.log and truth-ledger-events.log');
