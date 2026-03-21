import { createContext, useContext } from 'react';
import type { Strata } from '../strata/index.js';
import type { StrataProviderProps } from './react-types.js';

const StrataContext = createContext<Strata | null>(null);

export function StrataProvider({ strata, children }: StrataProviderProps): React.JSX.Element {
  return <StrataContext.Provider value={strata}>{children}</StrataContext.Provider>;
}

export function useStrataContext(): Strata {
  const strata = useContext(StrataContext);
  if (!strata) {
    throw new Error('useStrataContext must be used within a StrataProvider');
  }
  return strata;
}
