/**
 * Admin endpoints. Types mirror apps/api/app/schemas/admin.py.
 */
import { api } from './client';

export type Coordinator = {
  id: string;
  phone: string;
  display_name: string | null;
  created_at: string;
  artisan_count: number;
};

export const adminApi = {
  listCoordinators: () => api.get<Coordinator[]>('admin/coordinators'),

  createCoordinator: (phone: string, name: string) =>
    api.post<Coordinator>('admin/coordinators', { phone, name }),

  removeCoordinator: (id: string) => api.delete<void>(`admin/coordinators/${id}`),
};
