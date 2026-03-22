import { useState, useCallback, type FormEvent } from 'react';
import type { BaseTenant } from '@strata/tenant';
import type { TenantCreationWizardProps } from './react-types';
import { useTenant } from './use-tenant';

type WizardStep = 'name' | 'confirm' | 'done';

export function TenantCreationWizard({ onComplete, onCancel }: TenantCreationWizardProps): React.JSX.Element {
  const { createTenant } = useTenant();
  const [step, setStep] = useState<WizardStep>('name');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);

  const handleNameSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Tenant name is required');
      return;
    }
    setError(undefined);
    setStep('confirm');
  }, [name]);

  const handleConfirm = useCallback(async () => {
    setCreating(true);
    setError(undefined);
    try {
      const tenant = await createTenant({ name: name.trim() });
      setStep('done');
      onComplete?.(tenant as Readonly<BaseTenant>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tenant');
      setCreating(false);
    }
  }, [createTenant, name, onComplete]);

  const handleBack = useCallback(() => {
    setStep('name');
    setError(undefined);
  }, []);

  if (step === 'done') {
    return (
      <div data-testid="wizard-done">
        <p>Tenant &quot;{name.trim()}&quot; created successfully.</p>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div data-testid="wizard-confirm">
        <p>Create tenant &quot;{name.trim()}&quot;?</p>
        {error && <p data-testid="wizard-error" role="alert">{error}</p>}
        <button onClick={handleBack} disabled={creating}>Back</button>
        <button onClick={() => void handleConfirm()} disabled={creating} data-testid="wizard-create">
          {creating ? 'Creating…' : 'Create'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleNameSubmit} data-testid="wizard-name-step">
      <label htmlFor="tenant-name">Tenant Name</label>
      <input
        id="tenant-name"
        data-testid="wizard-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <p data-testid="wizard-error" role="alert">{error}</p>}
      <button type="submit">Next</button>
      {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
    </form>
  );
}
