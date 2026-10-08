#!/usr/bin/env node
// feature-preview.cjs <input.json>
// Predicts what happens if the patch from Edit is applied.
// Output: { ok, preview: { scenario, ifApplied[], ifNotApplied[], sideEffects[], confidence, recommendation } }
'use strict';
const fs = require('fs');
const http = require('http');
const inputPath = process.argv[2];
if (!inputPath || !fs.existsSync(inputPath)) { process.stdout.write(JSON.stringify({ ok: false, error: 'input file required' })); process.exit(2); }

function postChat(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ prompt, thinking: false, search: false });
    const req = http.request({ hostname: '127.0.0.1', port: 8790, path: '/deepseek/chat', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let acc = ''; res.on('data', (c) => (acc += c));
      res.on('end', () => { try { resolve(JSON.parse(acc)); } catch { reject(new Error('bad response')); } });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('deepseek timeout')));
    req.write(body); req.end();
  });
}
function tryParseJson(text) {
  const s = text.indexOf('{'); const e = text.lastIndexOf('}');
  if (s < 0 || e < 0 || e <= s) throw new Error('no JSON in response');
  return JSON.parse(text.slice(s, e + 1));
}

(async () => {
  try {
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const { apkName = 'target.apk', featureId = '', featureLabel = featureId, insight = null, edit = null } = input;

    const insightBlock = insight ? `\nINSIGHT:\n  Purpose: ${insight.purpose}\n  Risk: ${insight.risk}\n  How: ${insight.howItWorks}` : '';
    const editBlock = edit ? `\nPROPOSED PATCH:\n  Approach: ${edit.approach}\n  Target: ${edit.target}${edit.method ? '.' + edit.method : ''}\n  Language: ${edit.language}\n  Impact (as stated): ${edit.impact}\n  Payload (first 500 chars): ${(edit.payload || '').slice(0, 500)}` : '';

    const prompt = `You are a reverse-engineering analyst. Predict what happens if the proposed patch is applied to this APK.

APK: ${apkName}
FEATURE: ${featureLabel} (${featureId})${insightBlock}${editBlock}

Return ONLY valid JSON (no prose, no markdown):
{
  "scenario": "one-sentence description of the post-patch state",
  "ifApplied": ["concrete outcome 1", "concrete outcome 2", "concrete outcome 3"],
  "ifNotApplied": ["what remains broken/detected if patch is skipped"],
  "sideEffects": ["realistic side effect 1", "side effect 2"],
  "confidence": "low|medium|high",
  "recommendation": "one-sentence go/no-go guidance for the analyst"
}`;

    const resp = await postChat(prompt);
    if (!resp.ok || resp.response?.code !== 0) throw new Error(resp.response?.msg || resp.error || 'chat failed');
    const preview = tryParseJson(resp.response.data.content);
    process.stdout.write(JSON.stringify({ ok: true, preview }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: e && e.message ? e.message : String(e) }));
    process.exit(1);
  }
})();
