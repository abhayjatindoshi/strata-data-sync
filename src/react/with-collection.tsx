import { useState, useEffect, createElement, type ComponentType } from 'react';
import type { BehaviorSubject } from 'rxjs';

export function withCollection<TData, TOwnProps extends Record<string, unknown> = Record<string, never>>(
  WrappedComponent: ComponentType<TOwnProps & { readonly data: ReadonlyArray<TData> }>,
  getObservable: (props: TOwnProps) => BehaviorSubject<ReadonlyArray<TData>>,
): ComponentType<TOwnProps> {
  function WithCollectionWrapper(props: TOwnProps) {
    const observable = getObservable(props);
    const [data, setData] = useState<ReadonlyArray<TData>>(() => observable.getValue());

    useEffect(() => {
      const sub = observable.subscribe((val) => setData(val));
      return () => sub.unsubscribe();
    }, [observable]);

    // Cast required: generic HOC pattern cannot be fully verified by TypeScript
    return createElement(WrappedComponent, { ...props, data } as TOwnProps & { readonly data: ReadonlyArray<TData> });
  }

  WithCollectionWrapper.displayName = `withCollection(${
    WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component'
  })`;

  return WithCollectionWrapper;
}
