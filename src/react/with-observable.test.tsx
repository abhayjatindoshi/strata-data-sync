// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { BehaviorSubject } from 'rxjs';
import { withObservable } from './with-observable.js';

describe('withObservable', () => {
  it('subscribes and passes initial data as prop', () => {
    const subject = new BehaviorSubject<string | undefined>('hello');

    function Inner({ data }: { readonly data: string | undefined }) {
      return <div data-testid="value">{data ?? 'none'}</div>;
    }

    const Enhanced = withObservable<string>(Inner, () => subject);
    render(<Enhanced />);

    expect(screen.getByTestId('value').textContent).toBe('hello');
  });

  it('updates when observable emits new value', () => {
    const subject = new BehaviorSubject<string | undefined>('initial');

    function Inner({ data }: { readonly data: string | undefined }) {
      return <div data-testid="value">{data ?? 'none'}</div>;
    }

    const Enhanced = withObservable<string>(Inner, () => subject);
    render(<Enhanced />);

    expect(screen.getByTestId('value').textContent).toBe('initial');

    act(() => { subject.next('updated'); });

    expect(screen.getByTestId('value').textContent).toBe('updated');
  });

  it('handles undefined values', () => {
    const subject = new BehaviorSubject<string | undefined>(undefined);

    function Inner({ data }: { readonly data: string | undefined }) {
      return <div data-testid="value">{data ?? 'none'}</div>;
    }

    const Enhanced = withObservable<string>(Inner, () => subject);
    render(<Enhanced />);

    expect(screen.getByTestId('value').textContent).toBe('none');
  });

  it('sets displayName on wrapper', () => {
    const subject = new BehaviorSubject<number | undefined>(0);

    function MyWidget({ data }: { readonly data: number | undefined }) {
      return <div>{data}</div>;
    }

    const Enhanced = withObservable<number>(MyWidget, () => subject);
    expect(Enhanced.displayName).toBe('withObservable(MyWidget)');
  });
});
