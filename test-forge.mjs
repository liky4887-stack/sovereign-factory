// Test @three-ws/forge — free TRELLIS lane.
// Run: node test-forge.mjs
import { forge } from '@three-ws/forge';

console.log('Submitting forge job (free draft tier)...');
const t0 = Date.now();

try {
  const r = await forge('a chrome robot, product shot', {
    tier: 'draft',
    onProgress: (job) => {
      console.log('  [' + Math.round((Date.now() - t0) / 1000) + 's]',
        job.status, job.backend || '', job.etaSeconds ? 'eta ' + job.etaSeconds + 's' : '');
    },
  });
  console.log('---');
  console.log('status:', r.status);
  console.log('glbUrl:', r.glbUrl);
  console.log('viewerUrl:', r.viewerUrl);
  console.log('backend:', r.backend);
  console.log('tier:', r.tier);
  console.log('durable:', r.durable);
  console.log('elapsed:', Math.round((Date.now() - t0) / 1000) + 's');
} catch (e) {
  console.log('FAILED:', e.code || 'unknown', '-', e.message);
  if (e.detail) console.log('detail:', e.detail);
}
