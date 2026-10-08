// dex-class-map.mjs <apk-path> [--top N] [--all] [--json] [--stats]
// Parses DEX files, extracts classes + methods, and uses getDexCode to read
// string references inside method bodies. Maps signature keywords to
// (class, method) pairs that actually reference them.
import { DexFile } from 'libdex-ts';
import * as fs from 'fs';
import * as zlib from 'zlib';

const apk = process.argv[2];
if (!apk || !fs.existsSync(apk)) {
  console.log(JSON.stringify({ ok: false, error: 'apk not found: ' + apk }));
  process.exit(2);
}
const topArg = process.argv.indexOf('--top');
const TOP_N = process.argv.includes('--all')
  ? Infinity
  : (topArg > 0 ? parseInt(process.argv[topArg + 1], 10) : 120);
const WANT_JSON = process.argv.includes('--json');
const WANT_STATS = process.argv.includes('--stats');
const t0 = Date.now();

const SIGNATURES = {
  'device-fingerprint': ['FINGERPRINT','Build.SERIAL','ANDROID_ID','getImei','getDeviceId','getSubscriberId','TelephonyManager','AdvertisingIdClient','Settings.Secure','getLine1Number'],
  'session-integrity': ['session_token','sessionToken','refresh_token','SessionManager','JwtToken','AuthToken','Bearer '],
  'runtime-sensing': ['isRooted','RootBeer','isEmulator','isDebuggerConnected','waitForDebugger','goldfish','ranchu','qemu_pipe','ro.build.tags','/system/xbin/su','/system/bin/su'],
  'anti-tamper-hook': ['frida','Frida','XposedBridge','xposed','substrate','linjector','Magisk','magisk','re.frida.server'],
  'network-transport-guard': ['CertificatePinner','X509TrustManager','TrustManager','OkHttpClient','HostnameVerifier','sslPinning','SSLPeerUnverified','X509Certificate'],
  'telemetry-evidence': ['FirebaseAnalytics','com.google.firebase.analytics','Adjust','Bugly','AppsFlyer','Amplitude','Mixpanel','Flurry','umeng','Crashlytics'],
  'secure-storage': ['AndroidKeyStore','EncryptedSharedPreferences','EncryptedFile','KeyGenParameterSpec','SQLCipher','MasterKey','KeyStore'],
  'build-release-integrity': ['GET_SIGNATURES','getPackageInfo','signatures','SHA-256','apkSignature','MessageDigest'],
  'ota-governance': ['CodePush','codePush','com.microsoft.codepush','hotUpdate','updateBundle'],
  'privacy-compliance': ['UserConsent','consentStatus','hasUserConsent','IABTCF','GDPR','CCPA'],
  'observability-debug': ['DebugBridge','remoteDebug','Stethoscope','logcat','Timber','Crashlytics'],
  'performance-monitor': ['FirebasePerformance','com.google.firebase.perf','Trace.beginSection','NewRelic','FrameMetrics'],
  'cross-platform-abstraction': ['ReactNativeBridge','com.facebook.react','FlutterEngine','io.flutter','NativeModules','TurboModule'],
  'governance-killswitch': ['killSwitch','kill_switch','remoteDisable','emergencyStop','selfDestruct'],
  'differential-integrity': ['bundleHash','manifestHash','contentHash','integrityHash','expectedHash'],
  'rollback-recovery': ['rollback','rollbackSlot','lastKnownGood','downgrade'],
};

// ZIP reader
const fd = fs.openSync(apk, 'r');
const apkSize = fs.fstatSync(fd).size;
const tailLen = Math.min(65536, apkSize);
const tail = Buffer.alloc(tailLen);
fs.readSync(fd, tail, 0, tailLen, apkSize - tailLen);
let eocdRel = -1;
for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocdRel = i; break; }
if (eocdRel < 0) { console.log(JSON.stringify({ ok: false, error: 'no EOCD' })); process.exit(1); }
const cdEntries = tail.readUInt16LE(eocdRel + 10);
const cdSize = tail.readUInt32LE(eocdRel + 12);
const cdOffset = tail.readUInt32LE(eocdRel + 16);
const cd = Buffer.alloc(cdSize);
fs.readSync(fd, cd, 0, cdSize, cdOffset);

const allEntries = [];
let p = 0;
for (let i = 0; i < cdEntries && p < cd.length; i++) {
  if (cd.readUInt32LE(p) !== 0x02014b50) break;
  const method = cd.readUInt16LE(p + 10);
  const compressedSize = cd.readUInt32LE(p + 20);
  const uncompressedSize = cd.readUInt32LE(p + 24);
  const nameLen = cd.readUInt16LE(p + 28);
  const extraLen = cd.readUInt16LE(p + 30);
  const commentLen = cd.readUInt16LE(p + 32);
  const lho = cd.readUInt32LE(p + 42);
  const name = cd.slice(p + 46, p + 46 + nameLen).toString('utf8');
  allEntries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset: lho });
  p += 46 + nameLen + extraLen + commentLen;
}

function readEntry(entry) {
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

const allDex = allEntries.filter(e => e.name.endsWith('.dex'))
  .sort((a, b) => b.uncompressedSize - a.uncompressedSize);
const dexEntries = TOP_N === Infinity ? allDex : allDex.slice(0, TOP_N);

// ── Parse DEX, capture class + methods + string refs ─────────────
const classes = [];
let parsedDex = 0, parseErrors = 0;
const classMapSeen = new Set();

for (let d = 0; d < dexEntries.length; d++) {
  const entry = dexEntries[d];
  try {
    const dexBytes = readEntry(entry);
    const df = new DexFile(new Uint8Array(dexBytes));
    const nClasses = df.header.classDefsSize;
    const strIds = df.header.stringIdsSize;

    // Build a quick string table snapshot for this dex — used to
    // resolve string indices encountered in method code.
    const stringTable = [];
    for (let i = 0; i < strIds; i++) {
      try { stringTable.push(df.getStringById(i) || ''); } catch { stringTable.push(''); }
    }

    for (let i = 0; i < nClasses; i++) {
      try {
        const cd0 = df.getClassDef(i);
        if (!cd0) continue;
        const className = df.getClassNameByIdx(cd0.classIdx);
        if (!className) continue;
        const classKey = entry.name + '|' + className;
        if (classMapSeen.has(classKey)) continue;
        classMapSeen.add(classKey);

        const methods = [];
        if (cd0.classDataOff && cd0.classDataOff !== 0) {
          try {
            const data = df.getClassData(cd0.classDataOff);
            const collect = (arr, kind) => {
              for (const m of (arr || [])) {
                let name = '', codeStrings = [];
                try {
                  const mid = df.getMethodId(m.methodIdx);
                  if (mid) name = mid.name || '';
                } catch {}
                if (m.codeOff && m.codeOff !== 0) {
                  try {
                    const code = df.getDexCode(m.methodIdx);
                    if (code && Array.isArray(code.strings)) {
                      codeStrings = code.strings;
                    } else if (code && code.stringIds) {
                      codeStrings = code.stringIds.map(idx => stringTable[idx] || '').filter(Boolean);
                    }
                  } catch {}
                }
                methods.push({ name, kind, codeStrings });
              }
            };
            collect(data.directMethods, 'direct');
            collect(data.virtualMethods, 'virtual');
          } catch {}
        }
        classes.push({ dex: entry.name, name: className, methods });
      } catch {}
    }
    parsedDex++;
  } catch (e) {
    parseErrors++;
  }
  // progress tick every 200 dex
  if (d % 200 === 199 && !WANT_JSON) {
    process.stderr.write(`  parsed ${d + 1}/${dexEntries.length} dex…\n`);
  }
}

fs.closeSync(fd);

// ── Match signatures against class names, method names, string refs ──
const featureClasses = {};
for (const [fid, patterns] of Object.entries(SIGNATURES)) {
  const hits = [];
  const seen = new Set();
  for (const cls of classes) {
    for (const pat of patterns) {
      if (cls.name.includes(pat)) {
        const key = cls.name + '|' + pat + '|name';
        if (!seen.has(key)) {
          seen.add(key);
          hits.push({ dex: cls.dex, class: cls.name, method: null, pattern: pat, where: 'class-name' });
        }
      }
      for (const m of cls.methods) {
        if (m.name && m.name.includes(pat)) {
          const key = cls.name + '|' + pat + '|m:' + m.name;
          if (!seen.has(key)) {
            seen.add(key);
            hits.push({ dex: cls.dex, class: cls.name, method: m.name, pattern: pat, where: 'method-name' });
          }
        }
        for (const s of (m.codeStrings || [])) {
          if (s && s.includes(pat)) {
            const key = cls.name + '|' + pat + '|s:' + m.name;
            if (!seen.has(key)) {
              seen.add(key);
              hits.push({ dex: cls.dex, class: cls.name, method: m.name, pattern: pat, where: 'string-ref' });
            }
            break;
          }
        }
      }
    }
  }
  featureClasses[fid] = hits.slice(0, 40);
}

const out = {
  ok: true,
  apk, apkSize,
  dexFilesTotal: allDex.length,
  dexFilesAttempted: dexEntries.length,
  dexFilesParsed: parsedDex,
  parseErrors,
  totalClasses: classes.length,
  elapsedMs: Date.now() - t0,
  featureClasses,
};

if (WANT_JSON) {
  console.log(JSON.stringify(out));
} else if (WANT_STATS) {
  console.log(JSON.stringify({
    ok: out.ok, dexFilesAttempted: out.dexFilesAttempted, dexFilesParsed: out.dexFilesParsed,
    parseErrors: out.parseErrors, totalClasses: out.totalClasses, elapsedMs: out.elapsedMs,
    featureCounts: Object.fromEntries(Object.entries(out.featureClasses).map(([k, v]) => [k, v.length])),
  }, null, 2));
} else {
  console.log(JSON.stringify(out, null, 2));
}
