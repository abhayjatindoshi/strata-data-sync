export type StrataOptions = {
  readonly cloudSyncIntervalMs?: number;
  readonly localFlushIntervalMs?: number;
  readonly tombstoneRetentionMs?: number;
  readonly tenantKey?: string;
  readonly markerKey?: string;
};

export type ResolvedStrataOptions = Required<StrataOptions>;

export function resolveOptions(opts?: StrataOptions): ResolvedStrataOptions {
  return {
    cloudSyncIntervalMs: opts?.cloudSyncIntervalMs ?? 300_000,
    localFlushIntervalMs: opts?.localFlushIntervalMs ?? 2_000,
    tombstoneRetentionMs: opts?.tombstoneRetentionMs ?? 7 * 24 * 60 * 60 * 1000,
    tenantKey: opts?.tenantKey ?? '__tenants',
    markerKey: opts?.markerKey ?? '__strata',
  };
}
