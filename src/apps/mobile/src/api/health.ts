/**
 * Health endpoints. Types mirror apps/api/app/routers/health.py.
 */
import { api } from './client';

export type CheckName = 'db' | 'redis' | 'ml';

export type Check = {
  status: 'ok' | 'fail';
  latency_ms: number;
  detail?: string;
};

export type Liveness = {
  status: 'ok';
  env: string;
  version: string;
};

export type Readiness = {
  status: 'ok' | 'degraded' | 'unhealthy';
  env: string;
  offline_demo_mode: boolean;
  checks: Record<CheckName, Check>;
};

export const health = {
  live: () => api.get<Liveness>('health'),
  ready: () => api.get<Readiness>('health/ready'),
};
