#!/usr/bin/env node
// feature-export.cjs <input.json>
// Produces a standalone, shareable artifact for a single finding.
// Output: { ok, artifact: { name, type, contents, installInstructions, verification, dependencies[], checksum? } }
'use strict';
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
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
    const { apkName = 'target.apk', featureId = '', featureLabel = featureId, insight = null, edit = null, preview = null } = input;

    const context = [
      `APK: ${apkName}`,
      `FEATURE: ${featureLabel} (${featureId})`,
    ];
    if (insight) context.push(`INSIGHT: ${insight.purpose} [risk=${insight.risk}]`);
    if (edit) context.push(`PATCH: ${edit.approach} on ${edit.target}${edit.method ? '.' + edit.method : ''}`);
    if (preview) context.push(`PREDICTED SCENARIO: ${preview.scenario}`);

    const prompt = `You are a reverse-engineering analyst. Produce a FINAL DELIVERABLE artifact for a single finding.

${context.join('\n')}

Return ONLY valid JSON (no prose, no markdown):
{
  "name": "filename with extension (e.g. anti_tamper_bypass.js, patch.smali, hook.xml)",
  "type": "frida-script|smali-diff|manifest-fragment|native-patch|report|json-manifest",
  "contents": "the actual file contents — complete and runnable. Multi-line with \\n.",
  "installInstructions": "numbered steps to apply, with exact commands",
  "verification": "how to confirm it worked",
  "dependencies": ["dep 1", "dep 2"],
  "risk": "low|medium|high|critical"
}

Rules:
- contents must be a complete, self-contained artifact — no placeholders.
- If type is frida-script, contents must be valid Frida JS with Java.perform.
- If type is json-manifest, contents must be valid JSON.
- Do NOT wrap contents in markdown fences.`;

    const resp = await postChat(prompt);
    if (!resp.ok || resp.response?.code !== 0) throw new Error(resp.response?.msg || resp.error || 'chat failed');
    const artifact = tryParseJson(resp.response.data.content);
    const contents = artifact.contents || '';
    artifact.sizeBytes = Buffer.byteLength(contents, 'utf8');
    artifact.checksum = crypto.createHash('sha256').update(contents).digest('hex').slice(0, 16);
    process.stdout.write(JSON.stringify({ ok: true, artifact }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: e && e.message ? e.message : String(e) }));
    process.exit(1);
  }
})();
