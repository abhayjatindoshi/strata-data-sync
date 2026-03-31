import debug from 'debug';
import type { BlobAdapter, Tenant } from '@strata/adapter';
import type { Hlc } from '@strata/hlc';
import { tick } from '@strata/hlc';
import type { EntityEventBus } from '@strata/reactive';
import type { EntityStore } from '@strata/store';
import type { BlobMigration } from '@strata/schema/migration';
import type { ResolvedStrataOptions } from '../options';
import type {
  SyncLocation, SyncQueueItem, SyncEventListener, SyncEvent,
  SyncEnqueueResult, SyncEngine as SyncEngineType, SyncBetweenResult,
  SyncEntityChange,
} from './types';
import { syncBetween } from './unified';

const log = debug('strata:sync');

export class SyncEngine {
  private readonly queue: SyncQueueItem[] = [];
  private readonly listeners: SyncEventListener[] = [];
  private running = false;
  private disposed = false;

  constructor(
    private readonly store: EntityStore,
    private readonly localAdapter: BlobAdapter,
    private readonly cloudAdapter: BlobAdapter | undefined,
    private readonly entityNames: ReadonlyArray<string>,
    private readonly hlcRef: { current: Hlc },
    private readonly eventBus: EntityEventBus,
    private readonly migrations?: ReadonlyArray<BlobMigration>,
    private readonly options?: ResolvedStrataOptions,
  ) {}

  private resolveAdapter(loc: SyncLocation): BlobAdapter {
    switch (loc) {
      case 'memory': return this.store;
      case 'local': return this.localAdapter;
      case 'cloud':
        if (!this.cloudAdapter) throw new Error('No cloud adapter configured');
        return this.cloudAdapter;
    }
  }

  async sync(
    source: SyncLocation,
    target: SyncLocation,
    tenant: Tenant | undefined,
  ): Promise<SyncEnqueueResult> {
    if (this.disposed) {
      throw new Error('SyncEngine is disposed');
    }

    const existing = this.queue.find(
      item => item.source === source && item.target === target,
    );
    if (existing) {
      log('dedup: %s→%s already queued', source, target);
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
      this.emitEvent({ type: 'sync-started', source, target });
      try {
        syncResult = await syncBetween(
          sourceAdapter, targetAdapter, this.entityNames, tenant, this.migrations,
          this.options,
        );

        if (syncResult.maxHlc) {
          this.hlcRef.current = tick(this.hlcRef.current, syncResult.maxHlc);
        }

        const storeChanges = source === 'memory'
          ? syncResult.changesForA
          : target === 'memory' ? syncResult.changesForB : [];
        this.emitEntityChanges(storeChanges);

        this.emitEvent({
          type: 'sync-completed', source, target,
          result: {
            entitiesUpdated: syncResult.changesForB.length,
            conflictsResolved: syncResult.changesForA.length,
            partitionsSynced: syncResult.changesForA.length + syncResult.changesForB.length,
          },
        });
        log('%s→%s sync complete', source, target);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emitEvent({ type: 'sync-failed', source, target, error });
        throw err;
      }
    };

    this.queue.push({ source, target, fn, promise, resolve, reject });
    this.processQueue();

    await promise;
    return { result: syncResult, deduplicated: false };
  }

  on(listener: SyncEventListener): void {
    this.listeners.push(listener);
  }

  off(listener: SyncEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  private emitEvent(event: SyncEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  emit(event: SyncEvent): void {
    this.emitEvent(event);
  }

  private async processQueue(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      try {
        await item.fn();
        item.resolve();
      } catch (err) {
        item.reject(err instanceof Error ? err : new Error(String(err)));
      }
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

  dispose(): void {
    this.disposed = true;
    for (const item of this.queue) {
      item.reject(new Error('SyncEngine disposed'));
    }
    this.queue.length = 0;
  }

  private emitEntityChanges(changes: ReadonlyArray<SyncEntityChange>): void {
    const names = new Set<string>();
    for (const c of changes) {
      names.add(c.key.substring(0, c.key.indexOf('.')));
    }
    for (const name of names) {
      this.eventBus.emit({ entityName: name, fromSync: true });
    }
  }
}

const EMPTY_RESULT: SyncBetweenResult = {
  changesForA: [],
  changesForB: [],
  stale: false,
  maxHlc: undefined,
};
