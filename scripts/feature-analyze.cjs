#!/usr/bin/env node
// feature-analyze.cjs <input.json>
// Reads finding JSON from file, sends to local DeepSeek bridge, writes JSON result to stdout.
'use strict';
const fs = require('fs');
const http = require('http');

const inputPath = process.argv[2];
if (!inputPath || !fs.existsSync(inputPath)) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'input file required' }));
  process.exit(2);
}

function postChat(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ prompt, thinking: false, search: false });
    const req = http.request({
      hostname: '127.0.0.1', port: 8790, path: '/deepseek/chat',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let acc = '';
      res.on('data', (c) => (acc += c));
      res.on('end', () => {
        try { resolve(JSON.parse(acc)); }
        catch { reject(new Error('bad response: ' + acc.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('deepseek timeout')));
    req.write(body);
    req.end();
  });
}

function tryParseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) throw new Error('no JSON in response');
  return JSON.parse(text.slice(start, end + 1));
}

(async () => {
  try {
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const {
      apkName = 'target.apk', apkSize = 0, apkHash = '', featureId = '',
      featureLabel = featureId, message = '', totalHits = 0,
      patterns = [], topDex = [], topClasses = [],
    } = input;

    const prompt = `You are a reverse-engineering analyst. Explain a real finding from a real APK scan.

APK: ${apkName} (${(apkSize / 1024 / 1024 / 1024).toFixed(2)} GB)
SHA256: ${apkHash}
FEATURE: ${featureLabel} (${featureId})
FINDING: ${message}
HITS: ${totalHits} DEX files
PATTERNS MATCHED: ${patterns.slice(0, 12).join(', ') || '(none)'}
TOP DEX FILES: ${topDex.slice(0, 6).join(', ') || '(none)'}
TOP SIGNAL CLASSES: ${topClasses.slice(0, 12).join(', ') || '(none)'}

Return ONLY a valid JSON object. No markdown. No prose. Just JSON:
{
  "purpose": "one sentence explaining what this finding means in THIS specific APK",
  "howItWorks": "2-3 sentences on the concrete mechanism",
  "risk": "low|medium|high|critical",
  "riskReason": "one sentence justifying the risk level",
  "technical": ["bullet", "bullet", "bullet"],
  "recommendation": "one concrete next action for the analyst",
  "patchHint": "one line — technique, class, or file (or empty string)"
}`;

    const resp = await postChat(prompt);
    if (!resp.ok || resp.response?.code !== 0) {
      throw new Error(resp.response?.msg || resp.error || 'chat failed');
    }
    const insight = tryParseJson(resp.response.data.content);
    process.stdout.write(JSON.stringify({ ok: true, insight }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: e && e.message ? e.message : String(e) }));
    process.exit(1);
  }
})();
