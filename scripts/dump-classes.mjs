// dump-classes.mjs <apkPath> [--out PATH] [--limit N] [--package-prefix PREFIX]
// Full class dump. If --out is given, writes the JSON to disk and prints
// only a compact summary to stdout (avoids the backend's output cap).

import { DexFile } from 'libdex-ts';
import * as fs from 'fs';
import * as zlib from 'zlib';
import * as path from 'path';

const args = process.argv.slice(2);
const apkPath = args[0];
if (!apkPath) {
  console.log(JSON.stringify({ ok: false, error: 'usage: dump-classes.mjs <apkPath> [--out PATH] [--limit N] [--package-prefix P]' }));
  process.exit(2);
}
if (!fs.existsSync(apkPath)) {
  console.log(JSON.stringify({ ok: false, error: 'apk not found: ' + apkPath }));
  process.exit(2);
}

let outPath = '';
let limit = Infinity;
let prefix = '';
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) { outPath = args[i + 1]; i++; }
  else if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1], 10); i++; }
  else if (args[i] === '--package-prefix' && args[i + 1]) { prefix = args[i + 1]; i++; }
}

function readZipEntries(apk) {
  const fd = fs.openSync(apk, 'r');
  const apkSize = fs.fstatSync(fd).size;
  const tailLen = Math.min(65536, apkSize);
  const tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, apkSize - tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) { fs.closeSync(fd); throw new Error('no EOCD'); }
  const n = tail.readUInt16LE(eocd + 10);
  const cs = tail.readUInt32LE(eocd + 12);
  const co = tail.readUInt32LE(eocd + 16);
  const cd = Buffer.alloc(cs);
  fs.readSync(fd, cd, 0, cs, co);

  const entries = [];
  let p = 0;
  for (let i = 0; i < n; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const method = cd.readUInt16LE(p + 10);
    const csize = cd.readUInt32LE(p + 20);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localOff = cd.readUInt32LE(p + 42);
    const name = cd.slice(p + 46, p + 46 + nameLen).toString('utf8');
    entries.push({ name, method, csize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  fs.closeSync(fd);
  return { entries, apkSize };
}

function readEntryBytes(apk, entry) {
  const fd = fs.openSync(apk, 'r');
  const header = Buffer.alloc(30);
  fs.readSync(fd, header, 0, 30, entry.localOff);
  const nameLen = header.readUInt16LE(26);
  const extraLen = header.readUInt16LE(28);
  const dataStart = entry.localOff + 30 + nameLen + extraLen;
  const data = Buffer.alloc(entry.csize);
  fs.readSync(fd, data, 0, entry.csize, dataStart);
  fs.closeSync(fd);
  if (entry.method === 0) return data;
  if (entry.method === 8) return zlib.inflateRawSync(data);
  throw new Error('unsupported zip method: ' + entry.method);
}

const t0 = Date.now();
let zip;
try { zip = readZipEntries(apkPath); }
catch (e) { console.log(JSON.stringify({ ok: false, error: 'zip: ' + e.message })); process.exit(1); }

const dexEntries = zip.entries.filter(e => e.name.endsWith('.dex'));
const apkSize = zip.apkSize;

const classes = [];
let dexParsed = 0, parseErrors = 0, totalClasses = 0;

for (const e of dexEntries) {
  let bytes;
  try { bytes = readEntryBytes(apkPath, e); } catch { parseErrors++; continue; }
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
  } catch { parseErrors++; continue; }

  for (const rawName of classNames) {
    if (classes.length >= limit) break;
    const fqcn = rawName.replace(/\//g, '.');
    if (prefix && !fqcn.startsWith(prefix)) continue;
    const parts = fqcn.split('.');
    const simpleName = parts[parts.length - 1] || fqcn;
    const pkg = parts.slice(0, -1).join('.');
    classes.push({ fqcn, dex: e.name, package: pkg, simpleName, size: bytes.length });
  }
  if (classes.length >= limit) break;
}

const summary = {
  ok: true,
  apk: apkPath,
  apkSize,
  dexTotal: dexEntries.length,
  dexParsed,
  parseErrors,
  totalClasses,
  classesReturned: classes.length,
  elapsedMs: Date.now() - t0,
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ ...summary, classes }), 'utf8');
  summary.out = outPath;
  summary.bytesWritten = fs.statSync(outPath).size;
}

console.log(JSON.stringify(summary));
