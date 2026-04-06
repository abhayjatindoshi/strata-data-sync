export type StrataOptions = {
  readonly cloudSyncIntervalMs?: number;
  readonly localFlushIntervalMs?: number;
  readonly tombstoneRetentionMs?: number;
  readonly tenantKey?: string;
  readonly markerKey?: string;
  readonly systemEntityKey?: string;
};

export type ResolvedStrataOptions = Required<StrataOptions>;

export function resolveOptions(opts?: StrataOptions): ResolvedStrataOptions {
  const tombstoneRetentionMs = opts?.tombstoneRetentionMs ?? 7 * 24 * 60 * 60 * 1000;
  if (tombstoneRetentionMs < 0 || !Number.isFinite(tombstoneRetentionMs)) {
    throw new Error(`Invalid tombstoneRetentionMs: ${tombstoneRetentionMs}. Must be a finite non-negative number.`);
  }
  return {
    cloudSyncIntervalMs: opts?.cloudSyncIntervalMs ?? 300_000,
    localFlushIntervalMs: opts?.localFlushIntervalMs ?? 2_000,
    tombstoneRetentionMs,
    tenantKey: opts?.tenantKey ?? '__tenants',
    markerKey: opts?.markerKey ?? '__strata',
    systemEntityKey: opts?.systemEntityKey ?? '__system',
  };
}
