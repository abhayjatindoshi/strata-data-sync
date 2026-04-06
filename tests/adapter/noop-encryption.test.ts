import { describe, it, expect } from 'vitest';
import { noopEncryptionService } from '@strata/adapter';

describe('noopEncryptionService', () => {
  it('deriveKeys returns null', async () => {
    const result = await noopEncryptionService.deriveKeys('cred', 'app');
    expect(result).toBeNull();
  });

  it('generateKeyData returns keys unchanged', async () => {
    const result = await noopEncryptionService.generateKeyData('myKey');
    expect(result).toEqual({ keys: 'myKey' });
  });

  it('loadKeyData returns keys unchanged', async () => {
    const result = await noopEncryptionService.loadKeyData('myKey', { dek: 'data' });
    expect(result).toBe('myKey');
  });

  it('rekey returns keys unchanged', async () => {
    const result = await noopEncryptionService.rekey('myKey', 'cred', 'app');
    expect(result).toEqual({ keys: 'myKey' });
  });
});
