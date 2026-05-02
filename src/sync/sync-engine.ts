import type { Tenant } from '@/adapter';
import type { Hlc } from '@/hlc';
import { tick } from '@/hlc';
import type { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import type { EntityStore } from '@/store';
import type { BlobMigration } from '@/schema/migration';
import type { DataAdapter } from '@/persistence';
import { parseCompositeKey } from '@/utils';
import type { ReactiveFlag } from '@/utils';
import type { ResolvedStrataOptions } from '../options';
import { SyncError } from './errors';
import type {
  SyncLocation, SyncQueueItem, SyncEvent,
  SyncEnqueueResult, SyncBetweenResult,
  SyncEntityChange,
} from './types';
import { syncBetween } from './unified';
import { log } from '@/log';

export class SyncEngine {
  private readonly queue: SyncQueueItem[] = [];
  private running = false;
  private disposed = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly store: EntityStore,
    private readonly localAdapter: DataAdapter,
    private readonly cloudAdapter: DataAdapter | undefined,
    private readonly entityNames: ReadonlyArray<string>,
    private readonly hlcRef: { current: Hlc },
    private readonly entityEventBus: EventBus<EntityEvent>,
    private readonly syncEventBus: EventBus<SyncEvent>,
    private readonly options: ResolvedStrataOptions,
    private readonly migrations?: ReadonlyArray<BlobMigration>,
  ) {}

  private resolveAdapter(loc: SyncLocation): DataAdapter {
    switch (loc) {
      case 'memory': return this.store;
      case 'local': return this.localAdapter;
      case 'cloud':
        if (!this.cloudAdapter) throw new SyncError('No cloud adapter configured', { kind: 'cloud-not-configured' });
        return this.cloudAdapter;
    }
  }

  async sync(
    source: SyncLocation,
    target: SyncLocation,
    tenant: Tenant | undefined,
  ): Promise<SyncEnqueueResult> {
    if (this.disposed) {
      throw new SyncError('SyncEngine is disposed', { kind: 'sync-failed' });
    }

    const existing = this.queue.find(
      item => item.source === source && item.target === target,
    );
    if (existing) {
      log.sync('dedup: %s→%s already queued', source, target);
      await existing.promise;
      return { result: EMPTY_RESULT, deduplicated: true };
    }

    let syncResult: SyncBetweenResult = EMPTY_RESULT;

    let resolve!: () => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const fn = async () => {
      const sourceAdapter = this.resolveAdapter(source);
      const targetAdapter = this.resolveAdapter(target);
      this.syncEventBus.emit({ type: 'sync-started', source, target });
      try {
        syncResult = await syncBetween(
          sourceAdapter, targetAdapter, this.entityNames, tenant,
          this.options, this.migrations,
        );

        if (syncResult.maxHlc) {
          this.hlcRef.current = tick(this.hlcRef.current, syncResult.maxHlc);
        }

        const storeChanges = source === 'memory'
          ? syncResult.changesForA
          : target === 'memory' ? syncResult.changesForB : [];
        this.emitEntityChanges(storeChanges);

        this.syncEventBus.emit({
          type: 'sync-completed', source, target,
          result: {
            entitiesUpdated: syncResult.changesForB.length,
            conflictsResolved: syncResult.changesForA.length,
            partitionsSynced: syncResult.changesForA.length + syncResult.changesForB.length,
          },
        });
        log.sync('%s→%s sync complete', source, target);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.syncEventBus.emit({ type: 'sync-failed', source, target, error });
        throw err;
      }
    };

    this.queue.push({ source, target, fn, promise, resolve, reject });
    void this.processQueue();

    await promise;
    return { result: syncResult, deduplicated: false };
  }

  private async processQueue(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      if (this.disposed) break;
      const item = this.queue[0];
      const p = item.fn().then(
        () => { item.resolve(); },
        (err: unknown) => { item.reject(err instanceof Error ? err : new Error(String(err))); },
      );
      this.inFlight = p;
      await p;
      this.inFlight = null;
      this.queue.shift();
    }

    this.running = false;
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.running) {
      await this.queue[this.queue.length - 1]?.promise.catch(() => {});
      if (this.running && this.queue.length === 0) {
        await new Promise<void>(r => setTimeout(r, 0));
      }
    }
  }

  // ── Pipeline ───────────────────────────────────────────

  async run(
    tenant: Tenant | undefined,
    steps: ReadonlyArray<[SyncLocation, SyncLocation]>,
  ): Promise<SyncBetweenResult[]> {
    const results: SyncBetweenResult[] = [];
    for (const [source, target] of steps) {
      const { result } = await this.sync(source, target, tenant);
      results.push(result);
    }
    return results;
  }

  // ── Scheduler ──────────────────────────────────────────

  private localTimer: ReturnType<typeof setInterval> | null = null;
  private cloudTimer: ReturnType<typeof setInterval> | null = null;

  startScheduler(
    tenant: Tenant | undefined,
    hasCloud: boolean,
    dirtyTracker?: ReactiveFlag,
  ): void {
    this.stopScheduler();

    this.localTimer = setInterval(() => {
      this.sync('memory', 'local', tenant).catch((err: unknown) => {
        log.sync.error('local flush failed: %O', err);
      });
    }, this.options.localFlushIntervalMs);

    if (hasCloud) {
      this.cloudTimer = setInterval(() => {
        void (async () => {
          try {
            await this.sync('local', 'cloud', tenant);
            await this.sync('local', 'memory', tenant);
            dirtyTracker?.clear();
          } catch (err) {
            log.sync.error('cloud sync failed: %O', err);
          }
        })();
      }, this.options.cloudSyncIntervalMs);
    }

    log.sync('scheduler started (local=%dms, cloud=%dms)',
      this.options.localFlushIntervalMs,
      this.options.cloudSyncIntervalMs,
    );
  }

  stopScheduler(): void {
    if (this.localTimer !== null) {
      clearInterval(this.localTimer);
      this.localTimer = null;
    }
    if (this.cloudTimer !== null) {
      clearInterval(this.cloudTimer);
      this.cloudTimer = null;
    }
  }

  async dispose(): Promise<void> {
    this.stopScheduler();
    this.disposed = true;
    for (const item of this.queue) {
      item.reject(new Error('SyncEngine disposed'));
    }
    this.queue.length = 0;
    if (this.inFlight) {
      await this.inFlight.catch(() => {});
    }
  }

  private emitEntityChanges(changes: ReadonlyArray<SyncEntityChange>): void {
    const byEntity = new Map<string, { updates: string[]; deletes: string[] }>();
    for (const c of changes) {
      const parsed = parseCompositeKey(c.key);
      if (!parsed) continue;
      let entry = byEntity.get(parsed.entityName);
      if (!entry) {
        entry = { updates: [], deletes: [] };
        byEntity.set(parsed.entityName, entry);
      }
      entry.updates.push(...c.updatedIds);
      entry.deletes.push(...c.deletedIds);
    }
    for (const [entityName, { updates, deletes }] of byEntity) {
      this.entityEventBus.emit({ entityName, source: 'sync', updates, deletes });
    }
  }
}

const EMPTY_RESULT: SyncBetweenResult = {
  changesForA: [],
  changesForB: [],
  stale: false,
  maxHlc: undefined,
};
