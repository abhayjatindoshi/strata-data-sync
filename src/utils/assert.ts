import { StrataConfigError } from '@/errors';

export function assertNotDisposed(disposed: boolean, name: string = 'Instance'): void {
  if (disposed) throw new StrataConfigError(`${name} is disposed`);
}
