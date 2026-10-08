// query-classes.mjs <cacheFile> [options]
// Reads a dump-classes JSON, filters, returns a small JSON to stdout.
//
// Options:
//   --package PREFIX      match class package (exact prefix, dot form)
//   --contains STR        fqcn contains substring (case-insensitive)
//   --name STR            simpleName equals (case-insensitive)
//   --regex REGEX         fqcn matches regex
//   --dex FILE            class came from this DEX file
//   --limit N             max results (default 200, hard cap 2000)
//   --summary             only return counts, no class list

import * as fs from 'fs';

const args = process.argv.slice(2);
const cacheFile = args[0];
if (!cacheFile || !fs.existsSync(cacheFile)) {
  console.log(JSON.stringify({ ok: false, error: 'cache file required: ' + cacheFile }));
  process.exit(2);
}

const opts = { packagePrefix: '', contains: '', name: '', regex: null, dex: '', limit: 200, summary: false };
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === '--package' && args[i + 1]) { opts.packagePrefix = args[i + 1]; i++; }
  else if (a === '--contains' && args[i + 1]) { opts.contains = args[i + 1].toLowerCase(); i++; }
  else if (a === '--name' && args[i + 1]) { opts.name = args[i + 1].toLowerCase(); i++; }
  else if (a === '--regex' && args[i + 1]) { opts.regex = new RegExp(args[i + 1], 'i'); i++; }
  else if (a === '--dex' && args[i + 1]) { opts.dex = args[i + 1]; i++; }
  else if (a === '--limit' && args[i + 1]) { opts.limit = Math.min(2000, parseInt(args[i + 1], 10)); i++; }
  else if (a === '--summary') { opts.summary = true; }
}

let cache;
try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); }
catch (e) { console.log(JSON.stringify({ ok: false, error: 'bad cache: ' + e.message })); process.exit(1); }

const all = cache.classes || [];
const matched = [];

for (const c of all) {
  if (opts.packagePrefix && !c.package.startsWith(opts.packagePrefix)) continue;
  if (opts.dex && c.dex !== opts.dex) continue;
  if (opts.contains && c.fqcn.toLowerCase().indexOf(opts.contains) < 0) continue;
  if (opts.name && c.simpleName.toLowerCase() !== opts.name) continue;
  if (opts.regex && !opts.regex.test(c.fqcn)) continue;
  matched.push(c);
  if (opts.summary === false && matched.length >= opts.limit) break;
  if (opts.summary && matched.length > 500000) break;
}

if (opts.summary) {
  // Aggregate by package prefix
  const byPackage = {};
  for (const c of matched) {
    const top = c.package.split('.').slice(0, 3).join('.');
    byPackage[top] = (byPackage[top] || 0) + 1;
  }
  console.log(JSON.stringify({
    ok: true,
    totalInCache: all.length,
    matched: matched.length,
    byPackage,
  }));
  process.exit(0);
}

console.log(JSON.stringify({
  ok: true,
  totalInCache: all.length,
  matched: matched.length,
  returned: Math.min(matched.length, opts.limit),
  classes: matched.slice(0, opts.limit),
}));
