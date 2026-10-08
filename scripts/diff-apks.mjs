// diff-apks.mjs <apkA> <apkB>
// Real two-APK comparison: class sets, ZIP files, extension breakdown,
// feature signature deltas, and per-feature added/removed DEX files.
import { DexFile } from 'libdex-ts';
import * as fs from 'fs';
import * as zlib from 'zlib';

const apkA = process.argv[2];
const apkB = process.argv[3];
if (!apkA || !apkB) {
  console.log(JSON.stringify({ ok: false, error: 'usage: diff-apks.mjs <apkA> <apkB>' }));
  process.exit(2);
}
for (const p of [apkA, apkB]) {
  if (!fs.existsSync(p)) {
    console.log(JSON.stringify({ ok: false, error: 'apk not found: ' + p }));
    process.exit(2);
  }
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

// ── ZIP reader ────────────────────────────────────────────────────
function readApk(apkPath) {
  const fd = fs.openSync(apkPath, 'r');
  const apkSize = fs.fstatSync(fd).size;
  const tailLen = Math.min(65536, apkSize);
  const tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, apkSize - tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) { fs.closeSync(fd); throw new Error('no EOCD in ' + apkPath); }
  const n = tail.readUInt16LE(eocd + 10);
  const cs = tail.readUInt32LE(eocd + 12);
  const co = tail.readUInt32LE(eocd + 16);
  const cd = Buffer.alloc(cs);
  fs.readSync(fd, cd, 0, cs, co);

  const entries = [];
  let p = 0;
  for (let i = 0; i < n && p < cd.length; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const method = cd.readUInt16LE(p + 10);
    const cs2 = cd.readUInt32LE(p + 20);
    const us = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28);
    const el = cd.readUInt16LE(p + 30);
    const cl = cd.readUInt16LE(p + 32);
    const lho = cd.readUInt32LE(p + 42);
    const name = cd.slice(p + 46, p + 46 + nl).toString('utf8');
    entries.push({ name, method, compressedSize: cs2, uncompressedSize: us, localHeaderOffset: lho });
    p += 46 + nl + el + cl;
  }
  return { fd, apkSize, entries };
}

function readEntry(fd, entry) {
  const lh = Buffer.alloc(30);
  fs.readSync(fd, lh, 0, 30, entry.localHeaderOffset);
  const nl = lh.readUInt16LE(26);
  const el = lh.readUInt16LE(28);
  const dataOff = entry.localHeaderOffset + 30 + nl + el;
  const raw = Buffer.alloc(entry.compressedSize);
  fs.readSync(fd, raw, 0, entry.compressedSize, dataOff);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error('unsupported method ' + entry.method);
}

function extractClassesAndHits(apk) {
  const { fd, apkSize, entries } = readApk(apk);
  const dexEntries = entries.filter(e => e.name.endsWith('.dex'));
  const classSet = new Set();
  const featureHitsByDex = {};
  for (const k of Object.keys(SIGNATURES)) featureHitsByDex[k] = new Map();

  for (const e of dexEntries) {
    let bytes;
    try { bytes = readEntry(fd, e); } catch { continue; }

    // Class extraction
    try {
      const df = new DexFile(new Uint8Array(bytes));
      const nC = df.header.classDefsSize;
      for (let i = 0; i < nC; i++) {
        try {
          const cd0 = df.getClassDef(i);
          if (!cd0) continue;
          const nm = df.getClassNameByIdx(cd0.classIdx);
          if (nm) classSet.add(nm);
        } catch {}
      }
    } catch {}

    // Feature pattern scan
    const text = bytes.toString('latin1');
    for (const [fid, patterns] of Object.entries(SIGNATURES)) {
      const matched = [];
      for (const pat of patterns) if (text.indexOf(pat) !== -1) matched.push(pat);
      if (matched.length > 0) {
        featureHitsByDex[fid].set(e.name, matched);
      }
    }
  }
  fs.closeSync(fd);

  // Extension breakdown
  const byExt = {};
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (const e of entries) {
    const ext = (e.name.includes('.') ? e.name.split('.').pop() : '(none)').toLowerCase();
    byExt[ext] = (byExt[ext] || 0) + 1;
    totalCompressed += e.compressedSize;
    totalUncompressed += e.uncompressedSize;
  }

  return {
    apkSize,
    entries,
    entryNames: new Set(entries.map(e => e.name)),
    dexCount: dexEntries.length,
    classes: classSet,
    featureHitsByDex,
    byExt,
    totalCompressed,
    totalUncompressed,
  };
}

// ── Run both ─────────────────────────────────────────────────────
let A, B;
try {
  A = extractClassesAndHits(apkA);
  B = extractClassesAndHits(apkB);
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: 'read failed: ' + e.message }));
  process.exit(1);
}

// ── Class diff ───────────────────────────────────────────────────
const classesAdded = [];
const classesRemoved = [];
for (const c of B.classes) if (!A.classes.has(c)) classesAdded.push(c);
for (const c of A.classes) if (!B.classes.has(c)) classesRemoved.push(c);

// ── ZIP entry diff ───────────────────────────────────────────────
const filesAdded = [];
const filesRemoved = [];
for (const n of B.entryNames) if (!A.entryNames.has(n)) filesAdded.push(n);
for (const n of A.entryNames) if (!B.entryNames.has(n)) filesRemoved.push(n);

// ── Extension diff ───────────────────────────────────────────────
const allExts = new Set([...Object.keys(A.byExt), ...Object.keys(B.byExt)]);
const extDelta = [];
for (const ext of allExts) {
  const aCount = A.byExt[ext] || 0;
  const bCount = B.byExt[ext] || 0;
  if (aCount !== bCount) {
    extDelta.push({ ext, a: aCount, b: bCount, delta: bCount - aCount });
  }
}
extDelta.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

// ── Feature diff ─────────────────────────────────────────────────
const featureDiff = {};
for (const fid of Object.keys(SIGNATURES)) {
  const aHits = A.featureHitsByDex[fid];
  const bHits = B.featureHitsByDex[fid];
  const aDex = new Set(aHits.keys());
  const bDex = new Set(bHits.keys());
  const addedDex = [];
  const removedDex = [];
  for (const d of bDex) if (!aDex.has(d)) addedDex.push(d);
  for (const d of aDex) if (!bDex.has(d)) removedDex.push(d);
  if (aDex.size === 0 && bDex.size === 0) continue;
  featureDiff[fid] = {
    aHits: aDex.size,
    bHits: bDex.size,
    delta: bDex.size - aDex.size,
    addedDex: addedDex.slice(0, 20),
    removedDex: removedDex.slice(0, 20),
  };
}

// ── Emit ─────────────────────────────────────────────────────────
console.log(JSON.stringify({
  ok: true,
  elapsedMs: Date.now() - t0,
  apkA: {
    path: apkA,
    name: apkA.split('/').pop(),
    sizeBytes: A.apkSize,
    dexCount: A.dexCount,
    classCount: A.classes.size,
    entryCount: A.entries.length,
    totalCompressed: A.totalCompressed,
    totalUncompressed: A.totalUncompressed,
  },
  apkB: {
    path: apkB,
    name: apkB.split('/').pop(),
    sizeBytes: B.apkSize,
    dexCount: B.dexCount,
    classCount: B.classes.size,
    entryCount: B.entries.length,
    totalCompressed: B.totalCompressed,
    totalUncompressed: B.totalUncompressed,
  },
  summary: {
    classesAdded: classesAdded.length,
    classesRemoved: classesRemoved.length,
    filesAdded: filesAdded.length,
    filesRemoved: filesRemoved.length,
    sizeDeltaBytes: B.apkSize - A.apkSize,
    dexDelta: B.dexCount - A.dexCount,
    classDelta: B.classes.size - A.classes.size,
  },
  classes: {
    added: classesAdded.slice(0, 300),
    removed: classesRemoved.slice(0, 300),
    addedTotal: classesAdded.length,
    removedTotal: classesRemoved.length,
  },
  files: {
    added: filesAdded.slice(0, 200),
    removed: filesRemoved.slice(0, 200),
    addedTotal: filesAdded.length,
    removedTotal: filesRemoved.length,
  },
  extensions: extDelta,
  features: featureDiff,
}, null, 2));
