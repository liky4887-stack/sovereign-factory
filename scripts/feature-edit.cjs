#!/usr/bin/env node
// feature-edit.cjs <input.json>
// Reads a finding + its insight, produces a concrete patch payload.
// Output: { ok, edit: { approach, target, method, language, payload, before, after, impact, verification, risk } }
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
      apkName = 'target.apk',
      featureId = '',
      featureLabel = featureId,
      message = '',
      patterns = [],
      topClasses = [],
      insight = null,
    } = input;

    const insightBlock = insight ? `
PRIOR ANALYSIS:
  Purpose: ${insight.purpose || ''}
  How it works: ${insight.howItWorks || ''}
  Recommended next action: ${insight.recommendation || ''}
  Patch hint: ${insight.patchHint || ''}
  Risk: ${insight.risk || 'unknown'}
` : '(no prior analysis)';

    const prompt = `You are a reverse-engineering analyst producing an ACTUAL patch for a real APK.

APK: ${apkName}
FEATURE: ${featureLabel} (${featureId})
FINDING: ${message}
PATTERNS: ${patterns.slice(0, 12).join(', ') || '(none)'}
TOP CLASSES: ${topClasses.slice(0, 12).join(', ') || '(none)'}
${insightBlock}

Produce a concrete patch. Return ONLY valid JSON (no markdown, no prose):
{
  "approach": "frida-hook" | "smali-edit" | "manifest-edit" | "native-patch" | "config-edit" | "no-action",
  "target": "exact class, file, or lib path",
  "method": "exact method/function name, or empty string if N/A",
  "language": "javascript" | "smali" | "xml" | "json" | "text",
  "payload": "the ACTUAL code/script/xml — runnable. Multi-line with \\n. If approach is no-action, empty string.",
  "before": "the original snippet that gets changed (or empty string)",
  "after": "the new snippet after change (or empty string)",
  "impact": "what happens to the app when this is applied — what still works, what breaks",
  "verification": "how to confirm the patch took effect",
  "risk": "low|medium|high|critical"
}

Rules:
- If approach is "frida-hook", payload must be valid Frida JavaScript with Java.perform wrapper.
- If approach is "smali-edit", payload must be real smali — method body with .registers, .method, .end method.
- If approach is "manifest-edit", payload must be real AndroidManifest.xml fragment.
- If the target is a native .so, use "native-patch" and describe offsets/bytes.
- If you cannot produce a concrete patch with the given data, use "no-action" and explain why in the impact field.
- Do NOT wrap payload in markdown code fences.`;

    const resp = await postChat(prompt);
    if (!resp.ok || resp.response?.code !== 0) {
      throw new Error(resp.response?.msg || resp.error || 'chat failed');
    }
    const edit = tryParseJson(resp.response.data.content);
    process.stdout.write(JSON.stringify({ ok: true, edit }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: e && e.message ? e.message : String(e) }));
    process.exit(1);
  }
})();
