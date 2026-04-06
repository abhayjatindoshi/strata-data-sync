export function assertNotDisposed(disposed: boolean, name: string = 'Instance'): void {
  if (disposed) throw new Error(`${name} is disposed`);
}
