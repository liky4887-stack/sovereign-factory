#!/usr/bin/env node
// Real APK inspector. Runs on Termux. No dependencies.
// Usage: node apk-inspect.js <apk-path> [mode]
//   mode = "list"   → list ZIP entries (default)
//          "manifest" → dump AndroidManifest.xml metadata
//          "scan"   → scan DEX strings for known signatures
//          "full"   → everything
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const apkPath = process.argv[2];
const mode = (process.argv[3] || 'list').toLowerCase();

if (!apkPath) {
  console.error(JSON.stringify({ ok: false, error: 'apk path required' }));
  process.exit(2);
}
if (!fs.existsSync(apkPath)) {
  console.error(JSON.stringify({ ok: false, error: 'apk not found: ' + apkPath }));
  process.exit(2);
}

const fd = fs.openSync(apkPath, 'r');
const size = fs.fstatSync(fd).size;

// ── ZIP central directory reader ──────────────────────────────────
// Find End of Central Directory (EOCD) record. Scan last 64KB.
function findEocd() {
  const tailLen = Math.min(65536, size);
  const buf = Buffer.alloc(tailLen);
  fs.readSync(fd, buf, 0, tailLen, size - tailLen);
  for (let i = tailLen - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      return { eocdOffset: size - tailLen + i, buf, bufBase: size - tailLen };
    }
  }
  return null;
}

function readCentralDirectory() {
  const found = findEocd();
  if (!found) return null;
  const eocd = found.buf;
  const eocdRel = found.eocdOffset - found.bufBase;
  const cdEntries = eocd.readUInt16LE(eocdRel + 10);
  const cdSize = eocd.readUInt32LE(eocdRel + 12);
  const cdOffset = eocd.readUInt32LE(eocdRel + 16);

  const cd = Buffer.alloc(cdSize);
  fs.readSync(fd, cd, 0, cdSize, cdOffset);

  const entries = [];
  let p = 0;
  for (let i = 0; i < cdEntries && p < cd.length; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const method = cd.readUInt16LE(p + 10);
    const compressedSize = cd.readUInt32LE(p + 20);
    const uncompressedSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localHeaderOffset = cd.readUInt32LE(p + 42);
    const name = cd.slice(p + 46, p + 46 + nameLen).toString('utf8');
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, cdSize, cdOffset };
}

function readEntry(entry) {
  // Read local file header to get exact data offset
  const lh = Buffer.alloc(30);
  fs.readSync(fd, lh, 0, 30, entry.localHeaderOffset);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('bad local header');
  const nameLen = lh.readUInt16LE(26);
  const extraLen = lh.readUInt16LE(28);
  const dataOffset = entry.localHeaderOffset + 30 + nameLen + extraLen;
  const raw = Buffer.alloc(entry.compressedSize);
  fs.readSync(fd, raw, 0, entry.compressedSize, dataOffset);
  if (entry.method === 0) return raw; // stored
  if (entry.method === 8) return zlib.inflateRawSync(raw); // deflate
  throw new Error('unsupported compression method ' + entry.method);
}

// ── AndroidManifest.xml binary parser (minimal) ───────────────────
function parseManifest(buf) {
  // AXML format: string pool + XML chunks. We just need strings + attributes.
  try {
    const out = { strings: [], attributes: [], package: null };
    const type = buf.readUInt16LE(0);
    if (type !== 0x0003) return out; // not AXML
    const headerSize = buf.readUInt16LE(2);
    const totalSize = buf.readUInt32LE(4);
    // string pool chunk starts at headerSize
    let p = headerSize;
    if (buf.readUInt16LE(p) !== 0x0001) return out;
    const spHeaderSize = buf.readUInt16LE(p + 2);
    const spSize = buf.readUInt32LE(p + 4);
    const stringCount = buf.readUInt32LE(p + 8);
    const styleCount = buf.readUInt32LE(p + 12);
    const flags = buf.readUInt32LE(p + 16);
    const stringsStart = buf.readUInt32LE(p + 20);
    const isUtf8 = (flags & 0x100) !== 0;
    const offsets = [];
    for (let i = 0; i < stringCount; i++) offsets.push(buf.readUInt32LE(p + spHeaderSize + i * 4));
    const stringsBase = p + spHeaderSize + stringCount * 4 + styleCount * 4;
    for (const off of offsets) {
      const abs = stringsBase + off;
      try {
        if (isUtf8) {
          // UTF-8: 1-2 byte length (varint), then bytes, 0-term
          let len = buf[abs];
          let lp = abs + 1;
          if (len & 0x80) { len = ((len & 0x7f) << 8) | buf[lp]; lp++; }
          out.strings.push(buf.slice(lp, lp + len).toString('utf8'));
        } else {
          let len = buf.readUInt16LE(abs);
          let lp = abs + 2;
          if (len & 0x8000) { len = ((len & 0x7fff) << 16) | buf.readUInt16LE(lp); lp += 2; }
          out.strings.push(buf.slice(lp, lp + len * 2).toString('utf16le'));
        }
      } catch { out.strings.push(''); }
    }
    return out;
  } catch (e) {
    return { strings: [], error: String(e.message) };
  }
}

// ── DEX scanner ───────────────────────────────────────────────────
const SIGNATURES = [
  { id: 'frida',      patterns: ['frida', 'frida-gadget', 'linjector', 'gum-js-loop'] },
  { id: 'magisk',     patterns: ['magisk', 'com.topjohnwu.magisk'] },
  { id: 'xposed',     patterns: ['xposed', 'XposedBridge', 'de.robv.android.xposed'] },
  { id: 'supersu',    patterns: ['supersu', 'Superuser.apk', 'eu.chainfire.supersu'] },
  { id: 'rootbeer',   patterns: ['rootbeer', 'RootBeer'] },
  { id: 'safetynet',  patterns: ['safetynet', 'SafetyNet', 'com.google.android.gms.safetynet'] },
  { id: 'tamper',     patterns: ['signature.verify', 'SignatureCheck', 'integrity.check'] },
  { id: 'debug',      patterns: ['isDebuggerConnected', 'waitForDebugger', 'Debug.isDebuggerConnected'] },
  { id: 'emulator',   patterns: ['isEmulator', 'Build.FINGERPRINT', 'goldfish', 'ranchu', 'generic_x86'] },
  { id: 'cheat',      patterns: ['GameGuardian', 'gameguardian', 'speedhack', 'esp.wall'] },
  { id: 'vpn',        patterns: ['isVpnActive', 'NetworkInterface', 'tun0', 'ppp0'] },
  { id: 'native-lib', patterns: ['libUE4.so', 'libunity.so', 'libil2cpp.so'] },
];

function scanDex(buf) {
  const hits = {};
  // DEX file: check magic
  if (buf.length < 8) return hits;
  const magic = buf.slice(0, 4).toString('binary');
  const isDex = magic.startsWith('dex\n');
  // We only need printable ASCII strings from the string pool — but scanning
  // raw for known substrings works on both DEX and any binary.
  const text = buf.toString('latin1'); // fast, lossless for ASCII
  for (const sig of SIGNATURES) {
    for (const pat of sig.patterns) {
      if (text.includes(pat)) {
        if (!hits[sig.id]) hits[sig.id] = [];
        hits[sig.id].push(pat);
      }
    }
  }
  return { isDex, hits };
}

// ── Modes ─────────────────────────────────────────────────────────
function emit(obj) { process.stdout.write(JSON.stringify(obj, null, 2)); }

try {
  const result = { ok: true, apk: apkPath, sizeBytes: size, mode };

  if (mode === 'list' || mode === 'full') {
    const cd = readCentralDirectory();
    if (!cd) {
      emit({ ok: false, error: 'no ZIP end-of-central-directory found' });
      process.exit(1);
    }
    const byExt = {};
    let totalCompressed = 0, totalUncompressed = 0;
    for (const e of cd.entries) {
      const ext = path.extname(e.name).toLowerCase() || '(no ext)';
      byExt[ext] = (byExt[ext] || 0) + 1;
      totalCompressed += e.compressedSize;
      totalUncompressed += e.uncompressedSize;
    }
    const interesting = cd.entries.filter(e => {
      const n = e.name.toLowerCase();
      return n === 'androidmanifest.xml'
        || n.endsWith('.dex')
        || n.startsWith('lib/')
        || n.endsWith('.obb')
        || n.endsWith('.so')
        || n === 'resources.arsc';
    });
    result.zip = {
      entryCount: cd.entries.length,
      byExt,
      totalCompressed,
      totalUncompressed,
      interesting: interesting.slice(0, 200).map(e => ({
        name: e.name,
        compressed: e.compressedSize,
        uncompressed: e.uncompressedSize,
        method: e.method,
      })),
    };
  }

  if (mode === 'manifest' || mode === 'full') {
    const cd = readCentralDirectory();
    const mEntry = cd && cd.entries.find(e => e.name === 'AndroidManifest.xml');
    if (!mEntry) {
      result.manifest = { error: 'AndroidManifest.xml not found' };
    } else {
      const raw = readEntry(mEntry);
      const parsed = parseManifest(raw);
      // Heuristic: find package-like string (contains dots, matches com.*)
      const pkg = parsed.strings.find(s => /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,}$/i.test(s));
      result.manifest = {
        sizeBytes: mEntry.uncompressedSize,
        stringCount: parsed.strings.length,
        packageGuess: pkg || null,
        strings: parsed.strings.slice(0, 200),
      };
    }
  }

  if (mode === 'scan' || mode === 'full') {
    const cd = readCentralDirectory();
    const dexEntries = cd.entries.filter(e => e.name.endsWith('.dex'));
    result.dex = {
      count: dexEntries.length,
      files: dexEntries.map(e => ({ name: e.name, size: e.uncompressedSize })),
      signatures: {},
      scanned: 0,
    };
    // Sort by uncompressed size, biggest first — that's where real code lives
    const sorted = [...dexEntries].sort((a, b) => b.uncompressedSize - a.uncompressedSize);
    const toScan = sorted.slice(0, 40);
    result.dex.scanningTopN = toScan.length;
    for (const e of toScan) {
      try {
        const raw = readEntry(e);
        const scan = scanDex(raw);
        result.dex.scanned++;
        for (const [k, v] of Object.entries(scan.hits)) {
          if (!result.dex.signatures[k]) result.dex.signatures[k] = new Set();
          for (const p of v) result.dex.signatures[k].add(p);
        }
      } catch (err) {
        // skip unreadable dex
      }
    }
    // Convert Sets to arrays
    const sigsOut = {};
    for (const [k, v] of Object.entries(result.dex.signatures)) sigsOut[k] = Array.from(v);
    result.dex.signatures = sigsOut;
  }

  emit(result);
} catch (e) {
  emit({ ok: false, error: e && e.message ? e.message : String(e), stack: e && e.stack });
  process.exit(1);
} finally {
  try { fs.closeSync(fd); } catch {}
}
