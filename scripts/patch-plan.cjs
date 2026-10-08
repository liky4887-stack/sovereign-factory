#!/usr/bin/env node
// patch-plan.cjs <apk-path> <goal>
// goal = report | root-bypass | sig-bypass | remove-feature
'use strict';
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const apkPath = process.argv[2];
const goal = process.argv[3] || 'report';

if (!apkPath) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'apk path required' }));
  process.exit(2);
}

const inspectScript = path.join(__dirname, 'apk-inspect.cjs');
function runScript(script, args) {
  const out = execFileSync('node', [script, ...args], {
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,
    timeout: 300000,
  });
  return JSON.parse(out);
}

const deepScanScript = path.join(__dirname, 'deep-scan.mjs');
let inspectResult, deep;
try {
  inspectResult = runScript(inspectScript, [apkPath, 'list']);
  deep = runScript(deepScanScript, [apkPath]);
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'inspect failed: ' + String(e.message || e) }));
  process.exit(1);
}

const GOALS = {
  'report': 'Produce a complete security posture report for this APK. Enumerate every detection mechanism present, its purpose, and estimated difficulty of defeat (low/medium/high).',
  'root-bypass': 'Plan how to defeat root AND emulator detection in this APK. List the exact DEX classes/strings to patch, the smali changes required, and any native hooks needed.',
  'sig-bypass': 'Plan how to bypass signature verification in this APK. Identify the verification routine (DEX string or native lib), and describe the exact smali/native patch to make.',
  'remove-feature': 'Plan how to remove ads and disable telemetry. Identify ad SDK classes to strip, manifest components to remove, and any startup hooks to disable.',
};

const goalPrompt = GOALS[goal] || GOALS['report'];

// Build a compact, high-signal context for DeepSeek from the deep scan.
function summarizeFeature(fid) {
  const r = deep.features[fid];
  if (!r || r.totalHits === 0) return null;
  // Collect all signal classes across all hits, deduped
  const sigSet = new Set();
  for (const h of r.hits || []) {
    for (const c of (h.signalClasses || [])) sigSet.add(c);
  }
  return {
    hits: r.totalHits,
    dexCount: r.dexCount,
    patterns: r.patterns || [],
    topSignalClasses: Array.from(sigSet).slice(0, 25),
  };
}

const context = {
  apk: apkPath,
  sizeBytes: inspectResult.sizeBytes,
  zipEntries: inspectResult.zip && inspectResult.zip.entryCount,
  dexCount: deep.dexTotal,
  dexParsed: deep.dexParsed,
  totalClasses: deep.totalClasses,
  features: {
    deviceFingerprint: summarizeFeature('device-fingerprint'),
    runtimeSensing: summarizeFeature('runtime-sensing'),
    antiTamperHook: summarizeFeature('anti-tamper-hook'),
    networkTransportGuard: summarizeFeature('network-transport-guard'),
    telemetryEvidence: summarizeFeature('telemetry-evidence'),
    secureStorage: summarizeFeature('secure-storage'),
    buildReleaseIntegrity: summarizeFeature('build-release-integrity'),
    otaGovernance: summarizeFeature('ota-governance'),
    privacyCompliance: summarizeFeature('privacy-compliance'),
    observabilityDebug: summarizeFeature('observability-debug'),
    performanceMonitor: summarizeFeature('performance-monitor'),
    crossPlatformAbstraction: summarizeFeature('cross-platform-abstraction'),
    governanceKillswitch: summarizeFeature('governance-killswitch'),
    differentialIntegrity: summarizeFeature('differential-integrity'),
    rollbackRecovery: summarizeFeature('rollback-recovery'),
    jsBundleShield: summarizeFeature('js-bundle-shield'),
  },
};

const prompt = `You are a reverse-engineering analyst. Analyze this APK and produce a structured patch plan.

APK FACTS (from real static analysis):
${JSON.stringify(context, null, 2)}

GOAL: ${goalPrompt}

Output ONLY a JSON object with this exact shape, no prose:
{
  "summary": "one paragraph summary",
  "findings": [
    {"id": "short-id", "target": "class or lib", "evidence": "string or file", "risk": "low|medium|high", "defeat": "concrete steps"}
  ],
  "patchPlan": [
    {"step": 1, "file": "path in apk", "action": "edit|inject|remove", "payload": "smali or code snippet", "rationale": "why"}
  ],
  "nextSteps": ["..."]
}`;

function post(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 8790,
        path: '/deepseek/chat',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let acc = '';
        res.on('data', (c) => (acc += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(acc));
          } catch (e) {
            reject(new Error('bad response: ' + acc.slice(0, 200)));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(180000, () => {
      req.destroy(new Error('deepseek call timed out'));
    });
    req.write(body);
    req.end();
  });
}

(async () => {
  const r = await post({ prompt, thinking: false, search: false });
  if (!r.ok) {
    process.stdout.write(JSON.stringify({ ok: false, error: r.error || 'deepseek call failed' }));
    process.exit(1);
  }
  const content = r.response.data.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  let plan;
  try {
    plan = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch {
    plan = { raw: content };
  }
  process.stdout.write(JSON.stringify({ ok: true, goal, plan }, null, 2));
})().catch((e) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(e.message || e) }, null, 2));
  process.exit(1);
});
