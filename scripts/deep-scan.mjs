// deep-scan.mjs <apk-path>
// One pass: parse each DEX, extract class names, scan raw bytes for
// signature patterns, and attribute each pattern hit to the classes
// that live in the same DEX file.
import { DexFile } from 'libdex-ts';
import * as fs from 'fs';
import * as zlib from 'zlib';

const apkPath = process.argv[2];
if (!apkPath || !fs.existsSync(apkPath)) {
  console.log(JSON.stringify({ ok: false, error: 'apk not found' }));
  process.exit(2);
}
const t0 = Date.now();

const SIGNATURES = {
  'device-fingerprint': ['FINGERPRINT','Build.SERIAL','ANDROID_ID','getImei','getDeviceId','getSubscriberId','TelephonyManager','AdvertisingIdClient','Settings.Secure','getLine1Number'],
  'session-integrity': ['session_token','sessionToken','refresh_token','SessionManager','JwtToken','AuthToken'],
  'js-bundle-shield': ['index.android.bundle','index.ios.bundle','.jsbundle','bundle.hbc','hermes'],
  'runtime-sensing': ['isRooted','RootBeer','isEmulator','isDebuggerConnected','waitForDebugger','goldfish','ranchu','qemu_pipe','ro.build.tags','/system/xbin/su','/system/bin/su','ro.debuggable'],
  'anti-tamper-hook': ['frida','Frida','XposedBridge','xposed','substrate','linjector','Magisk','magisk','re.frida.server','cydia'],
  'network-transport-guard': ['CertificatePinner','X509TrustManager','TrustManager','OkHttpClient','HostnameVerifier','sslPinning','SSLPeerUnverified','X509Certificate'],
  'telemetry-evidence': ['FirebaseAnalytics','com.google.firebase.analytics','com.adjust.sdk','com.tencent.bugly','AppsFlyer','Amplitude','Mixpanel','Flurry','com.umeng','Crashlytics'],
  'secure-storage': ['AndroidKeyStore','EncryptedSharedPreferences','EncryptedFile','KeyGenParameterSpec','SQLCipher','MasterKey','KeyStore'],
  'build-release-integrity': ['GET_SIGNATURES','getPackageInfo','apkSignature','MessageDigest'],
  'ota-governance': ['CodePush','codePush','com.microsoft.codepush','hotUpdate','updateBundle'],
  'privacy-compliance': ['UserConsent','consentStatus','hasUserConsent','IABTCF','gdpr','consent_required'],
  'observability-debug': ['DebugBridge','remoteDebug','Stethoscope','logcat','Timber','Crashlytics'],
  'performance-monitor': ['FirebasePerformance','com.google.firebase.perf','Trace.beginSection','NewRelic','FrameMetrics'],
  'cross-platform-abstraction': ['ReactNativeBridge','com.facebook.react','FlutterEngine','io.flutter','NativeModules','TurboModule','DartExecutor'],
  'governance-killswitch': ['killSwitch','kill_switch','remoteDisable','emergencyStop','selfDestruct'],
  'differential-integrity': ['bundleHash','manifestHash','contentHash','integrityHash','expectedHash'],
  'rollback-recovery': ['rollback','rollbackSlot','lastKnownGood','downgrade'],
};

// ── ZIP central directory ────────────────────────────────────────
const fd = fs.openSync(apkPath, 'r');
const apkSize = fs.fstatSync(fd).size;
const tailLen = Math.min(65536, apkSize);
const tail = Buffer.alloc(tailLen);
fs.readSync(fd, tail, 0, tailLen, apkSize - tailLen);
let eocd = -1;
for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
if (eocd < 0) { console.log(JSON.stringify({ ok: false, error: 'no EOCD' })); process.exit(1); }
const n = tail.readUInt16LE(eocd + 10);
const cs = tail.readUInt32LE(eocd + 12);
const co = tail.readUInt32LE(eocd + 16);
const cd = Buffer.alloc(cs);
fs.readSync(fd, cd, 0, cs, co);

let p = 0;
const dexEntries = [];
for (let i = 0; i < n && p < cd.length; i++) {
  if (cd.readUInt32LE(p) !== 0x02014b50) break;
  const method = cd.readUInt16LE(p + 10);
  const cs2 = cd.readUInt32LE(p + 20);
  const us = cd.readUInt32LE(p + 24);
  const nl = cd.readUInt16LE(p + 28);
  const el = cd.readUInt16LE(p + 30);
  const cl = cd.readUInt16LE(p + 32);
  const lho = cd.readUInt32LE(p + 42);
  const nm = cd.slice(p + 46, p + 46 + nl).toString('utf8');
  if (nm.endsWith('.dex')) dexEntries.push({ name: nm, method, cs: cs2, us, lho });
  p += 46 + nl + el + cl;
}
dexEntries.sort((a, b) => b.us - a.us);

function readDex(e) {
  const lh = Buffer.alloc(30);
  fs.readSync(fd, lh, 0, 30, e.lho);
  const off = e.lho + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const raw = Buffer.alloc(e.cs);
  fs.readSync(fd, raw, 0, e.cs, off);
  return e.method === 0 ? raw : zlib.inflateRawSync(raw);
}

// ── Pass: per DEX — parse classes, scan patterns ─────────────────
const byFeature = {};
for (const k of Object.keys(SIGNATURES)) byFeature[k] = [];

let dexParsed = 0, parseErrors = 0, totalClasses = 0;

for (const e of dexEntries) {
  let bytes;
  try { bytes = readDex(e); } catch { parseErrors++; continue; }

  // Class extraction
  let classNames = [];
  try {
    const df = new DexFile(new Uint8Array(bytes));
    const nClasses = df.header.classDefsSize;
    for (let i = 0; i < nClasses; i++) {
      try {
        const cd0 = df.getClassDef(i);
        if (!cd0) continue;
        const nm = df.getClassNameByIdx(cd0.classIdx);
        if (nm) classNames.push(nm);
      } catch {}
    }
    totalClasses += classNames.length;
    dexParsed++;
  } catch {}

  // Pattern scan
  const text = bytes.toString('latin1');
  for (const [fid, patterns] of Object.entries(SIGNATURES)) {
    const matched = [];
    for (const pat of patterns) if (text.indexOf(pat) !== -1) matched.push(pat);
    if (matched.length === 0) continue;

    // Filter classes in this DEX that relate to any matched pattern
    const related = [];
    for (const pat of matched) {
      for (const cls of classNames) {
        // Match on final segment (after last dot/slash) or whole substring
        const short = cls.split('/').pop() || cls;
        if (short.toLowerCase().includes(pat.toLowerCase()) ||
            pat.toLowerCase().includes(short.toLowerCase())) {
          if (!related.includes(cls)) related.push(cls);
        }
      }
    }
    // Filter out framework / vendor packages — keep signal only.
    const FRAMEWORK_PREFIXES = [
      'android.', 'androidx.', 'java.', 'javax.', 'kotlin.', 'kotlinx.',
      'com.google.android.gms.', 'com.google.android.material.',
      'com.google.firebase.', 'com.google.android.play.',
      'io.reactivex.', 'okhttp3.', 'okio.', 'com.squareup.okhttp.',
      'org.intellij.', 'org.jetbrains.', 'com.facebook.react.',
      'com.facebook.internal.', 'com.facebook.login.', 'com.facebook.appevents.',
      'com.android.billingclient.', 'com.adjust.sdk.',
      'com.google.android.recaptcha.', 'com.google.gson.',
      'com.google.protobuf.', 'com.google.android.exoplayer.',
      'com.google.android.ads.', 'com.google.android.gms.',
      'a.', 'b.', 'c.', 'd.', 'e.', 'f.', 'g.', 'h.', 'i.', 'j.',
      'k.', 'l.', 'm.', 'n.', 'o.', 'p.', 'q.', 'r.', 's.', 't.',
      'u.', 'v.', 'w.', 'x.', 'y.', 'z.',
      'a0.', 'a1.', 'a2.', 'a3.', 'b0.', 'b1.', 'c0.', 'c1.',
      'c7.', 'd0.', 'e0.', 'f0.', 'g0.', 'h0.',
    ];
    const isFramework = (c) => {
      const lc = c.toLowerCase().replace(/\//g, '.').replace(/^l/, '').replace(/;\$/, '');
      // Strip leading single-letter obfuscation like 'a.a' or 'k.a'
      const normalized = lc.replace(/;\$[0-9a-z]+$/i, '');
      if (FRAMEWORK_PREFIXES.some(pre => normalized.startsWith(pre))) return true;
      // Single/short-name obfuscation like 'a.a', 'ax.b', 'x.y' — drop
      if (/^[a-z][a-z0-9]?(\.[a-z][a-z0-9]?){0,2}$/.test(normalized)) return true;
      return false;
    };
    const signalClasses = classNames.filter(c => !isFramework(c));

    byFeature[fid].push({
      dex: e.name,
      size: e.us,
      patterns: matched,
      classCount: classNames.length,
      signalClasses: signalClasses.slice(0, 12),
      relatedClasses: related.slice(0, 8),
    });
  }
}
fs.closeSync(fd);

// ── Summarize ────────────────────────────────────────────────────
const features = {};
for (const [fid, hits] of Object.entries(byFeature)) {
  const totalPatterns = new Set();
  for (const h of hits) for (const pat of h.patterns) totalPatterns.add(pat);
  features[fid] = {
    totalHits: hits.length,
    dexCount: hits.length,
    patterns: Array.from(totalPatterns),
    hits: hits.slice(0, 20),
  };
}

console.log(JSON.stringify({
  ok: true,
  apk: apkPath,
  apkSize,
  dexTotal: dexEntries.length,
  dexParsed,
  parseErrors,
  totalClasses,
  elapsedMs: Date.now() - t0,
  features,
}, null, 2));
