import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Strata } from '../strata/index.js';

const StrataContext = createContext<Strata | null>(null);

export type StrataProviderProps = {
  readonly strata: Strata;
  readonly children: ReactNode;
};

export function StrataProvider({ strata, children }: StrataProviderProps) {
  return <StrataContext.Provider value={strata}>{children}</StrataContext.Provider>;
}

export function useStrata(): Strata {
  const strata = useContext(StrataContext);
  if (!strata) throw new Error('useStrata must be used within StrataProvider');
  return strata;
}
