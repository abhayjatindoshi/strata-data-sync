import type { KeyStrategy } from './key-strategy';

export type DatePeriod = 'year' | 'month' | 'day';

export type DateKeyStrategyOptions = {
  readonly period: DatePeriod;
  readonly field?: string;
};

function formatPartitionKey(date: Date, period: DatePeriod): string {
  const year = date.getUTCFullYear().toString();
  if (period === 'year') return year;

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  if (period === 'month') return `${year}-${month}`;

  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateKeyStrategy(options: DateKeyStrategyOptions): KeyStrategy {
  const { period, field = 'createdAt' } = options;

  return {
    getPartitionKey(_entityName: string, entity: Record<string, unknown>): string {
      const value = entity[field];
      const date = value instanceof Date ? value : new Date();
      return formatPartitionKey(date, period);
    },

    getRelevantKeys(_entityName: string, _filter?: Record<string, unknown>): string[] {
      return [];
    },
  };
}
