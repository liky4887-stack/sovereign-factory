// ForgeService — image -> 3D GLB via @three-ws/forge (free tier).
//
// Wraps the three.ws Forge SDK with sane defaults for our pipeline:
//   - image path (native image->3D reconstruction)
//   - hunyuan3d backend explicitly (trellis_selfhost's worker is cold and
//     times out; hunyuan3d is the free self-hosted worker that responds)
//   - draft tier (12k poly, no PBR, fast)
//   - 5-minute timeout (job ETAs run 60-120s in practice)
//
// Returns the durable R2 URL for the GLB. No download — the URL is
// served over HTTPS and can be referenced directly from generated HTML.

import { forge } from '@three-ws/forge';
import { log } from '../shared/logger';

export interface Forge3DResult {
  glbUrl: string;
  viewerUrl: string;
  backend: string;
  elapsedMs: number;
}

export async function imageTo3D(
  imageUrls: string[],
  prompt?: string,
): Promise<Forge3DResult | null> {
  if (!imageUrls || imageUrls.length === 0) return null;

  const t0 = Date.now();
  try {
    const r = await forge(
      {
        images: imageUrls,
        prompt: prompt || 'the object in this image, full 3D reconstruction',
      },
      {
        path: 'image',
        tier: 'draft',
        backend: 'hunyuan3d',
        timeoutMs: 300_000,
        pollIntervalMs: 4_000,
      },
    );

    if (r.status !== 'done' || !r.glbUrl) {
      log.warn('forge.image_to_3d_not_done', {
        status: r.status,
        backend: r.backend,
        jobId: r.jobId,
      });
      return null;
    }

    log.info('forge.image_to_3d_ok', {
      backend: r.backend,
      glbUrl: r.glbUrl,
      elapsedMs: Date.now() - t0,
    });

    return {
      glbUrl: r.glbUrl,
      viewerUrl: r.viewerUrl || '',
      backend: r.backend || 'unknown',
      elapsedMs: Date.now() - t0,
    };
  } catch (e) {
    log.warn('forge.image_to_3d_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
