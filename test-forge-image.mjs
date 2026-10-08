// Test @three-ws/forge — image path.
// Run: node test-forge-image.mjs
import { forge } from '@three-ws/forge';

// A clean product shot from a public source.
const imageUrl = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1024';

console.log('Submitting image->3D job...');
const t0 = Date.now();

try {
  const r = await forge(
    { images: [imageUrl], prompt: 'the sneaker in this photo, full 3D reconstruction' },
    {
      path: 'image',
      tier: 'draft',
      onProgress: (job) => {
        console.log('  [' + Math.round((Date.now() - t0) / 1000) + 's]',
          job.status, job.backend || '', job.etaSeconds ? 'eta ' + job.etaSeconds + 's' : '');
      },
    },
  );
  console.log('---');
  console.log('status:', r.status);
  console.log('glbUrl:', r.glbUrl);
  console.log('viewerUrl:', r.viewerUrl);
  console.log('backend:', r.backend);
  console.log('tier:', r.tier);
  console.log('elapsed:', Math.round((Date.now() - t0) / 1000) + 's');
} catch (e) {
  console.log('FAILED:', e.code || 'unknown', '-', e.message);
  if (e.detail) console.log('detail:', e.detail);
}
