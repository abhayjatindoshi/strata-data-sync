import { useState, useEffect, createElement, type ComponentType } from 'react';
import type { BehaviorSubject } from 'rxjs';

export function withObservable<TData, TOwnProps extends Record<string, unknown> = Record<string, never>>(
  WrappedComponent: ComponentType<TOwnProps & { readonly data: TData | undefined }>,
  getObservable: (props: TOwnProps) => BehaviorSubject<TData | undefined>,
): ComponentType<TOwnProps> {
  function WithObservableWrapper(props: TOwnProps) {
    const observable = getObservable(props);
    const [data, setData] = useState<TData | undefined>(() => observable.getValue());

    useEffect(() => {
      const sub = observable.subscribe((val) => setData(val));
      return () => sub.unsubscribe();
    }, [observable]);

    // Cast required: generic HOC pattern cannot be fully verified by TypeScript
    return createElement(WrappedComponent, { ...props, data } as TOwnProps & { readonly data: TData | undefined });
  }

  WithObservableWrapper.displayName = `withObservable(${
    WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component'
  })`;

  return WithObservableWrapper;
}
