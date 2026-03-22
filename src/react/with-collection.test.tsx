// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { BehaviorSubject } from 'rxjs';
import { withCollection } from './with-collection';

describe('withCollection', () => {
  it('subscribes and passes initial data array', () => {
    const subject = new BehaviorSubject<ReadonlyArray<string>>(['a', 'b']);

    function Inner({ data }: { readonly data: ReadonlyArray<string> }) {
      return <div data-testid="count">{data.length}</div>;
    }

    const Enhanced = withCollection<string>(Inner, () => subject);
    render(<Enhanced />);

    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('updates when collection observable emits', () => {
    const subject = new BehaviorSubject<ReadonlyArray<string>>([]);

    function Inner({ data }: { readonly data: ReadonlyArray<string> }) {
      return <div data-testid="items">{data.join(',')}</div>;
    }

    const Enhanced = withCollection<string>(Inner, () => subject);
    render(<Enhanced />);

    expect(screen.getByTestId('items').textContent).toBe('');

    act(() => { subject.next(['x', 'y', 'z']); });

    expect(screen.getByTestId('items').textContent).toBe('x,y,z');
  });

  it('sets displayName on wrapper', () => {
    const subject = new BehaviorSubject<ReadonlyArray<number>>([]);

    function ListWidget({ data }: { readonly data: ReadonlyArray<number> }) {
      return <div>{data.length}</div>;
    }

    const Enhanced = withCollection<number>(ListWidget, () => subject);
    expect(Enhanced.displayName).toBe('withCollection(ListWidget)');
  });
});
