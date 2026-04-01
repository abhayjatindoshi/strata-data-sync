import { resolveOptions } from '@strata/options';
import type { ResolvedStrataOptions } from '@strata/options';
import { MemoryBlobAdapter } from '@strata/adapter';
import { toDataAdapter } from '@strata/persistence';
import type { DataAdapter } from '@strata/persistence';

export const DEFAULT_OPTIONS: ResolvedStrataOptions = resolveOptions();

export function createDataAdapter(): DataAdapter {
  return toDataAdapter(new MemoryBlobAdapter());
}
