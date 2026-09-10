/** 3D preview endpoints. Types mirror apps/api/app/schemas/preview3d.py. */
import { api } from './client';

export type Preview3DStatus = 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';

export type Preview3DJob = {
  job_id: string;
  status: Preview3DStatus;
  media_id: string | null;
  glb_url: string | null;
  error: string | null;
};

export const preview3dApi = {
  start: (mediaId: string, listingId?: string) =>
    api.post<Preview3DJob>('preview3d/start', { media_id: mediaId, listing_id: listingId }),

  poll: (jobId: string) => api.get<Preview3DJob>(`preview3d/${jobId}`),
};
