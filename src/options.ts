export type StrataOptions = {
  readonly cloudSyncIntervalMs?: number;
  readonly localFlushIntervalMs?: number;
  readonly tombstoneRetentionMs?: number;
  readonly tenantKey?: string;
  readonly markerKey?: string;
  readonly systemEntityKey?: string;
};

export type ResolvedStrataOptions = Required<StrataOptions>;

import { StrataConfigError } from '@/errors';

function validatePositiveInterval(name: string, value: number): void {
  if (value <= 0 || !Number.isFinite(value)) {
    throw new StrataConfigError(`Invalid ${name}: ${value}. Must be a finite positive number.`);
  }
}

export function resolveOptions(opts?: StrataOptions): ResolvedStrataOptions {
  const tombstoneRetentionMs = opts?.tombstoneRetentionMs ?? 7 * 24 * 60 * 60 * 1000;
  if (tombstoneRetentionMs < 0 || !Number.isFinite(tombstoneRetentionMs)) {
    throw new StrataConfigError(`Invalid tombstoneRetentionMs: ${tombstoneRetentionMs}. Must be a finite non-negative number.`);
  }
  const cloudSyncIntervalMs = opts?.cloudSyncIntervalMs ?? 300_000;
  validatePositiveInterval('cloudSyncIntervalMs', cloudSyncIntervalMs);
  const localFlushIntervalMs = opts?.localFlushIntervalMs ?? 2_000;
  validatePositiveInterval('localFlushIntervalMs', localFlushIntervalMs);
  return {
    cloudSyncIntervalMs,
    localFlushIntervalMs,
    tombstoneRetentionMs,
    tenantKey: opts?.tenantKey ?? '__tenants',
    markerKey: opts?.markerKey ?? '__strata',
    systemEntityKey: opts?.systemEntityKey ?? '__system',
  };
}
