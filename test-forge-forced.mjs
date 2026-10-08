// Force hunyuan3d for image path.
import { forge } from '@three-ws/forge';

const imageUrl = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1024';
console.log('Submitting image->3D job, forcing backend hunyuan3d...');
const t0 = Date.now();

try {
  const r = await forge(
    { images: [imageUrl], prompt: 'the sneaker in this photo, full 3D reconstruction' },
    {
      path: 'image',
      tier: 'draft',
      backend: 'hunyuan3d',
      timeoutMs: 300000,        // give it 5 minutes
      pollIntervalMs: 4000,
      onProgress: (job) => {
        const s = Math.round((Date.now() - t0) / 1000);
        console.log('  [' + s + 's] ' + job.status + ' ' + (job.backend || ''));
      },
    },
  );
  console.log('---');
  console.log('status:', r.status);
  console.log('glbUrl:', r.glbUrl);
  console.log('viewerUrl:', r.viewerUrl);
  console.log('backend:', r.backend);
  console.log('elapsed:', Math.round((Date.now() - t0) / 1000) + 's');
} catch (e) {
  console.log('FAILED:', e.code || 'unknown', '-', e.message);
}
